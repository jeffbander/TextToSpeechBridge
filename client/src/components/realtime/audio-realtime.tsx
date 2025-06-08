import { useState, useRef, useCallback } from 'react';
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

export default function AudioRealtime({ patientId, patientName, callId, onEnd }: AudioRealtimeProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionInitializedRef = useRef(false);
  const { toast } = useToast();

  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      // Create audio processor for real-time PCM16 conversion
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isRecording) {
          const inputBuffer = event.inputBuffer.getChannelData(0);
          
          // Convert float32 to PCM16 (24kHz mono)
          const pcm16 = new Int16Array(inputBuffer.length);
          for (let i = 0; i < inputBuffer.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputBuffer[i]));
            pcm16[i] = Math.floor(sample * 32767);
          }
          
          wsRef.current.send(JSON.stringify({
            type: 'audio_input',
            audio: Array.from(pcm16)
          }));
        }
      };
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      mediaRecorderRef.current = { processor, source } as any;
      
      console.log('[AUDIO] Microphone initialized for 24kHz PCM16');
    } catch (error) {
      console.error('[AUDIO] Microphone access denied:', error);
      toast({
        title: "Microphone Required",
        description: "Please allow microphone access for voice sessions",
        variant: "destructive"
      });
    }
  }, [toast, isRecording]);

  const playAudioBuffer = useCallback(async (audioData: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      
      // Ensure audio context is running
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      try {
        // Try standard audio decoding first
        const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start();
        console.log('[AUDIO] Playing GPT-4o voice response');
      } catch (decodeError) {
        // Fallback: handle PCM16 data manually
        console.log('[AUDIO] Using PCM16 fallback conversion');
        const pcmData = new Int16Array(audioData);
        const audioBuffer = audioContextRef.current.createBuffer(1, pcmData.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < pcmData.length; i++) {
          channelData[i] = pcmData[i] / 32768.0;
        }
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start();
        console.log('[AUDIO] PCM16 audio playback successful');
      }
    } catch (error) {
      console.error('[AUDIO] Error playing audio:', error);
    }
  }, []);

  const startSession = async () => {
    // Prevent duplicate session creation from React re-renders and rapid clicks
    if (sessionInitializedRef.current || isCreatingSession) {
      console.log('[AUDIO] Session already initialized or being created, skipping duplicate');
      return;
    }
    
    sessionInitializedRef.current = true;
    setIsCreatingSession(true);
    
    try {
      setStatus('connecting');
      setTranscript([]);
      
      console.log('[AUDIO] Creating SINGLE session for', patientName);
      
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, patientName, callId })
      });
      
      if (!response.ok) {
        sessionInitializedRef.current = false;
        setIsCreatingSession(false);
        throw new Error('Failed to create session');
      }
      
      const data = await response.json();
      
      // Construct WebSocket URL for main server with path routing
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/realtime${data.websocketUrl}`;
      
      console.log(`[AUDIO] Session data received:`, data);
      console.log(`[AUDIO] Constructed URL: ${wsUrl}`);
      console.log(`[AUDIO] Protocol: ${protocol}, Host: ${host}`);
      
      const websocket = new WebSocket(wsUrl);
      wsRef.current = websocket;
      
      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (websocket.readyState === WebSocket.CONNECTING) {
          console.error('[AUDIO] Connection timeout');
          websocket.close();
          setStatus('error');
          toast({
            title: "Connection Timeout",
            description: "Voice session failed to connect. Please try again.",
            variant: "destructive"
          });
        }
      }, 10000);
      
      websocket.onopen = () => {
        console.log('[AUDIO] WebSocket connected');
        clearTimeout(connectionTimeout);
        setStatus('connected');
        setIsCreatingSession(false);
        initializeAudio();
        
        // Auto-start conversation immediately after connection
        setTimeout(() => {
          startConversation();
        }, 1000);
        
        toast({
          title: "Connected",
          description: "AI conversation starting..."
        });
      };

      websocket.onmessage = (event) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            playAudioBuffer(event.data);
          } else {
            const message = JSON.parse(event.data);
            
            if (message.type === 'connection_established') {
              console.log('[AUDIO] Session confirmed:', message.sessionId);
              // Session ready - wait for manual start button click
              
            } else if (message.type === 'audio_delta') {
              // Handle base64 audio chunks from GPT-4o
              const audioData = Uint8Array.from(atob(message.audio), c => c.charCodeAt(0));
              playAudioBuffer(audioData.buffer);
            } else if (message.type === 'transcript') {
              setTranscript(prev => [...prev, `${message.speaker}: ${message.text}`]);
            } else if (message.type === 'audio_transcript_delta') {
              setConversationStarted(true);
            }
          }
        } catch (error) {
          console.error('[AUDIO] Message processing error:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('[AUDIO] WebSocket error:', error);
        clearTimeout(connectionTimeout);
        sessionInitializedRef.current = false;
        setIsCreatingSession(false);
        setStatus('error');
        cleanup();
        toast({
          title: "Connection Error",
          description: "Voice session connection failed. Please try again.",
          variant: "destructive"
        });
      };

      websocket.onclose = () => {
        console.log('[AUDIO] Connection closed');
        clearTimeout(connectionTimeout);
        setStatus('idle');
        cleanup();
      };
      
    } catch (error) {
      console.error('[AUDIO] Session error:', error);
      setStatus('error');
      toast({
        title: "Session Error",
        description: "Could not start voice session",
        variant: "destructive"
      });
    }
  };

  const startConversation = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Not Connected",
        description: "Start session first",
        variant: "destructive"
      });
      return;
    }

    console.log('[AUDIO] Starting conversation - SINGLE TRIGGER');
    wsRef.current.send(JSON.stringify({
      type: 'start_conversation'
    }));
    setConversationStarted(true);
  };

  const toggleRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !conversationStarted) {
      toast({
        title: "Start Conversation First",
        description: "Click Start Conversation before recording",
        variant: "destructive"
      });
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      
      wsRef.current.send(JSON.stringify({
        type: 'audio_input_complete'
      }));
      
      console.log('[AUDIO] Recording stopped');
    } else {
      setIsRecording(true);
      console.log('[AUDIO] Recording started');
    }
  };

  const endSession = () => {
    cleanup();
    setStatus('idle');
    onEnd?.();
  };

  const cleanup = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current as any;
      if (recorder.processor) {
        recorder.processor.disconnect();
      }
      if (recorder.source) {
        recorder.source.disconnect();
      }
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsRecording(false);
    setConversationStarted(false);
    sessionInitializedRef.current = false;
    setIsCreatingSession(false);
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500">Connected</Badge>;
      case 'connecting':
        return <Badge className="bg-yellow-500">Connecting...</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Ready</Badge>;
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Single GPT-4o Session - {patientName}</span>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {status === 'connected' && (
              <Badge variant="outline" className="text-xs">
                Session Active - Single AI Instance
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Simplified Control Buttons */}
        <div className="flex gap-2 justify-center">
          {status === 'idle' && (
            <Button 
              onClick={startSession} 
              disabled={isCreatingSession}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              <Phone className="w-5 h-5" />
              {isCreatingSession ? 'Starting AI Call...' : 'Start AI Call'}
            </Button>
          )}
          
          {status === 'connecting' && (
            <Button disabled className="flex items-center gap-2" size="lg">
              <Phone className="w-5 h-5 animate-pulse" />
              Connecting to AI...
            </Button>
          )}
          
          {(status === 'connected' || conversationStarted) && (
            <>
              <Button
                onClick={toggleRecording}
                variant={isRecording ? "destructive" : "default"}
                className="flex items-center gap-2"
                size="lg"
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {isRecording ? 'Stop Speaking' : 'Speak to AI'}
              </Button>
              
              <Button onClick={endSession} variant="outline" className="flex items-center gap-2" size="lg">
                <PhoneOff className="w-5 h-5" />
                End Call
              </Button>
            </>
          )}
          
          {status === 'error' && (
            <Button 
              onClick={startSession} 
              disabled={isCreatingSession}
              variant="outline"
              size="lg"
            >
              {isCreatingSession ? 'Retrying...' : 'Try Again'}
            </Button>
          )}
        </div>

        {/* Transcript Display */}
        {transcript.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Conversation:</h4>
            <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
              {transcript.map((line, index) => (
                <div key={index} className="text-sm mb-1">
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session Status */}
        {status === 'connected' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-sm font-medium text-green-800">Single AI Session Active</div>
            <div className="text-xs text-green-600 mt-1">
              One GPT-4o instance for {patientName} | Use 'End Session' to stop completely
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="text-sm text-gray-600 text-center">
          {status === 'idle' && "Start a new conversation with one AI agent"}
          {status === 'connecting' && "Connecting to single AI instance..."}
          {status === 'connected' && !isRecording && "AI ready - click 'Start Recording' to speak"}
          {status === 'connected' && isRecording && "Recording voice input for AI"}
          {status === 'error' && "Connection failed - retry to establish single session"}
        </div>
      </CardContent>
    </Card>
  );
}