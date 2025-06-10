import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AudioRealtimeProps {
  patientId: number;
  patientName: string;
  callId: number;
  onEnd?: () => void;
}

interface RealtimeSession {
  sessionId: string;
  websocketUrl: string;
  status: string;
}

export default function AudioRealtime({ patientId, patientName, callId, onEnd }: AudioRealtimeProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  // CRITICAL: Audio buffer accumulation for single voice playback
  const audioBufferRef = useRef<number[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  
  const { toast } = useToast();

  // Initialize audio context
  useEffect(() => {
    const initAudioContext = async () => {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('Audio context initialized');
      } catch (error) {
        console.error('Failed to initialize audio context:', error);
      }
    };

    initAudioContext();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Audio buffer accumulation (prevents overlapping voices)
  const accumulateAudioBuffer = useCallback((audioData: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    
    try {
      const pcmData = new Int16Array(audioData);
      console.log(`Accumulating ${pcmData.length} audio samples`);
      
      // Add samples to buffer (convert Int16 to Float32)
      for (let i = 0; i < pcmData.length; i++) {
        audioBufferRef.current.push(pcmData[i] / 32768.0);
      }
    } catch (error) {
      console.error('Error accumulating audio buffer:', error);
    }
  }, []);

  // Play complete accumulated audio as single stream
  const playAccumulatedAudio = useCallback(async () => {
    if (!audioContextRef.current || audioBufferRef.current.length === 0) {
      console.log('No audio to play or context unavailable');
      return;
    }

    // Prevent overlapping audio playback
    if (isPlayingRef.current) {
      console.log('Audio already playing, skipping');
      return;
    }

    try {
      isPlayingRef.current = true;

      // Stop any currently playing audio
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
          currentSourceRef.current.disconnect();
        } catch (e) {
          // Source may already be stopped
        }
        currentSourceRef.current = null;
      }

      // Ensure AudioContext is running
      if (audioContextRef.current.state !== 'running') {
        await audioContextRef.current.resume();
      }

      const sampleCount = audioBufferRef.current.length;
      console.log(`Playing accumulated audio: ${sampleCount} samples`);

      // Create audio buffer from accumulated samples
      const audioBuffer = audioContextRef.current.createBuffer(1, sampleCount, 24000);
      const channelData = audioBuffer.getChannelData(0);

      // Copy accumulated samples to audio buffer
      for (let i = 0; i < sampleCount; i++) {
        channelData[i] = audioBufferRef.current[i];
      }

      // Create and configure source node
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      // Track current source
      currentSourceRef.current = source;

      // Handle playback completion
      source.onended = () => {
        console.log('Audio playback completed');
        isPlayingRef.current = false;
        currentSourceRef.current = null;
        // Clear buffer after successful playback
        audioBufferRef.current = [];
      };

      // Start playback
      source.start(0);

    } catch (error) {
      console.error('Error playing accumulated audio:', error);
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      audioBufferRef.current = [];
    }
  }, []);

  // Start realtime session
  const startRealtimeSession = async () => {
    try {
      setConnectionStatus('connecting');
      
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientId,
          patientName,
          callId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const sessionData: RealtimeSession = await response.json();
      setSession(sessionData);
      
      // Connect to WebSocket
      connectWebSocket(sessionData);
      
    } catch (error) {
      console.error('Error starting session:', error);
      setConnectionStatus('error');
      toast({
        title: "Connection Failed",
        description: "Failed to start real-time session",
        variant: "destructive"
      });
    }
  };

  // Connect to WebSocket
  const connectWebSocket = (sessionData: RealtimeSession) => {
    try {
      const wsUrl = `ws://localhost:5000/ws/realtime${sessionData.websocketUrl}`;
      const ws = new WebSocket(wsUrl);
      
      websocketRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        toast({
          title: "Connected",
          description: "Real-time audio session established"
        });
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
      };
      
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      setConnectionStatus('error');
    }
  };

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'audio_delta':
        // Accumulate audio instead of playing immediately
        try {
          const audioData = new Uint8Array(atob(message.audio).split('').map(c => c.charCodeAt(0)));
          accumulateAudioBuffer(audioData.buffer);
        } catch (error) {
          console.error('Error processing audio delta:', error);
        }
        break;
        
      case 'audio_done':
        // Trigger accumulated audio playback when OpenAI completes response
        console.log('Audio completion signal received, playing accumulated audio');
        playAccumulatedAudio();
        break;
        
      case 'text_delta':
        // Update transcript with AI response
        setTranscript(prev => [...prev, `AI: ${message.text}`]);
        break;
        
      case 'transcript_update':
        // Update transcript with patient speech
        setTranscript(prev => [...prev, `Patient: ${message.text}`]);
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  };

  // Start recording patient's voice
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      audioStreamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && websocketRef.current?.readyState === WebSocket.OPEN) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            websocketRef.current?.send(JSON.stringify({
              type: 'audio_chunk',
              audio: base64
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };
      
      mediaRecorder.start(100); // Send chunks every 100ms
      setIsRecording(true);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Failed",
        description: "Could not access microphone",
        variant: "destructive"
      });
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
  };

  // End session
  const endSession = () => {
    stopRecording();
    
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }
    
    // Clear audio buffer
    audioBufferRef.current = [];
    isPlayingRef.current = false;
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setSession(null);
    setTranscript([]);
    
    onEnd?.();
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Real-time Audio Call - {patientName}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
            {connectionStatus}
          </Badge>
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              Recording
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {!isConnected ? (
            <Button onClick={startRealtimeSession} disabled={connectionStatus === 'connecting'}>
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Start Session'}
            </Button>
          ) : (
            <>
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                variant={isRecording ? 'destructive' : 'default'}
                className="flex items-center gap-2"
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Button>
              <Button onClick={endSession} variant="outline">
                <PhoneOff className="h-4 w-4 mr-2" />
                End Call
              </Button>
            </>
          )}
        </div>

        {transcript.length > 0 && (
          <div className="border rounded-lg p-4 bg-gray-50 max-h-60 overflow-y-auto">
            <h3 className="font-semibold mb-2">Conversation Transcript</h3>
            <div className="space-y-1">
              {transcript.map((entry, index) => (
                <div key={index} className="text-sm">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}