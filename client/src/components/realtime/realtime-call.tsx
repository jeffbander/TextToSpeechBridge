import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { audioManager } from '@/lib/audio-manager';

interface RealtimeCallProps {
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

export default function RealtimeCall({ patientId, patientName, callId, onEnd }: RealtimeCallProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [session, setSession] = useState<RealtimeSession | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  // Initialize real-time session
  const startRealtimeSession = async () => {
    try {
      setConnectionStatus('connecting');
      
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, patientName, callId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }
      
      const sessionData = await response.json();
      setSession(sessionData);
      
      // Connect to WebSocket
      await connectWebSocket(sessionData.sessionId);
      
    } catch (error) {
      console.error('Error starting realtime session:', error);
      setConnectionStatus('error');
      toast({
        title: "Connection Error",
        description: "Failed to start real-time session",
        variant: "destructive"
      });
    }
  };

  // Connect to WebSocket for real-time communication
  const connectWebSocket = async (sessionId: string) => {
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/realtime?session=${sessionId}`;
      
      const ws = new WebSocket(wsUrl);
      websocketRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        toast({
          title: "Connected",
          description: "Real-time voice session established"
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
          const pcmData = new Int16Array(audioData.buffer);
          audioManager.addAudioData(pcmData);
        } catch (error) {
          console.error('Error accumulating audio delta:', error);
        }
        break;
        
      case 'audio_done':
        // Trigger accumulated audio playback when OpenAI completes response
        audioManager.playAccumulatedAudio().catch(error => {
          console.error('Error playing accumulated audio:', error);
        });
        break;
        
      case 'text_delta':
        // Update transcript with AI response
        setTranscript(prev => [...prev, `AI: ${message.text}`]);
        break;
        
      case 'transcript_update':
        // Update transcript with patient speech
        setTranscript(prev => [...prev, `Patient: ${message.text}`]);
        break;
    }
  };

  // Play audio chunks from AI
  const playAudioDelta = async (audioData: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // Convert base64 to array buffer
      const binaryString = window.atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const decodedAudio = await audioContextRef.current.decodeAudioData(bytes.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = decodedAudio;
      source.connect(audioContextRef.current.destination);
      source.start();
      
    } catch (error) {
      console.error('Error playing audio:', error);
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
          // Convert audio to base64 and send
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
      
      // Start the conversation
      if (websocketRef.current?.readyState === WebSocket.OPEN) {
        websocketRef.current.send(JSON.stringify({
          type: 'start_conversation'
        }));
      }
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone Error",
        description: "Failed to access microphone",
        variant: "destructive"
      });
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  // End the real-time session
  const endSession = async () => {
    try {
      stopRecording();
      
      if (websocketRef.current) {
        websocketRef.current.send(JSON.stringify({
          type: 'end_conversation'
        }));
        websocketRef.current.close();
      }
      
      if (session) {
        await fetch(`/api/realtime/session/${session.sessionId}`, {
          method: 'DELETE'
        });
      }
      
      setIsConnected(false);
      setSession(null);
      setConnectionStatus('disconnected');
      
      if (onEnd) {
        onEnd();
      }
      
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  // Toggle mute
  const toggleMute = () => {
    if (audioStreamRef.current) {
      audioStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (websocketRef.current) {
        websocketRef.current.close();
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>GPT-4o Real-time Call</span>
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
            {connectionStatus}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Patient: {patientName} | Call ID: {callId}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Controls */}
        <div className="flex gap-2 justify-center">
          {!isConnected ? (
            <Button onClick={startRealtimeSession} size="lg">
              <Phone className="mr-2 h-4 w-4" />
              Start Real-time Call
            </Button>
          ) : (
            <>
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                variant={isRecording ? "destructive" : "default"}
                size="lg"
              >
                {isRecording ? (
                  <>
                    <MicOff className="mr-2 h-4 w-4" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-4 w-4" />
                    Start Recording
                  </>
                )}
              </Button>
              
              <Button
                onClick={toggleMute}
                variant="outline"
                size="lg"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              
              <Button
                onClick={endSession}
                variant="destructive"
                size="lg"
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                End Call
              </Button>
            </>
          )}
        </div>

        {/* Status Information */}
        <div className="text-center space-y-2">
          {connectionStatus === 'connecting' && (
            <p className="text-sm text-muted-foreground">Connecting to GPT-4o...</p>
          )}
          {connectionStatus === 'connected' && isRecording && (
            <p className="text-sm text-green-600">🔴 Live conversation in progress</p>
          )}
          {connectionStatus === 'error' && (
            <p className="text-sm text-red-600">Connection failed. Please try again.</p>
          )}
        </div>

        {/* Live Transcript */}
        {transcript.length > 0 && (
          <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
            <h4 className="font-semibold mb-2">Live Transcript:</h4>
            <div className="space-y-1 text-sm">
              {transcript.map((line, index) => (
                <p key={index} className={line.startsWith('AI:') ? 'text-blue-600' : 'text-green-600'}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Real-time voice conversation with GPT-4o</p>
          <p>• AI will respond naturally to patient's voice</p>
          <p>• Automatic transcription and analysis</p>
          <p>• Enhanced healthcare conversation capabilities</p>
        </div>
      </CardContent>
    </Card>
  );
}