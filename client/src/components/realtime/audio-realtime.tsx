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
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { toast } = useToast();

  const initializeAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext();
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          event.data.arrayBuffer().then(buffer => {
            const audioContext = new AudioContext();
            audioContext.decodeAudioData(buffer).then(audioBuffer => {
              const pcmData = audioBuffer.getChannelData(0);
              const pcm16 = new Int16Array(pcmData.length);
              for (let i = 0; i < pcmData.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
              }
              
              wsRef.current?.send(JSON.stringify({
                type: 'audio_input',
                audio: Array.from(pcm16)
              }));
            });
          });
        }
      };

      console.log('[AUDIO] Microphone access granted');
    } catch (error) {
      console.error('[AUDIO] Microphone access denied:', error);
      toast({
        title: "Microphone Required",
        description: "Please allow microphone access for voice sessions",
        variant: "destructive"
      });
    }
  }, [toast]);

  const playAudioBuffer = useCallback(async (audioData: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
      console.log('[AUDIO] Playing GPT-4o voice response');
    } catch (error) {
      console.error('[AUDIO] Error playing audio:', error);
    }
  }, []);

  const startSession = async () => {
    try {
      setStatus('connecting');
      setTranscript([]);
      
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, patientName, callId })
      });
      
      if (!response.ok) {
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
        initializeAudio();
        toast({
          title: "Connected",
          description: "GPT-4o voice session active"
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
            } else if (message.type === 'audio_delta') {
              // Handle base64 audio chunks from GPT-4o
              const audioData = Uint8Array.from(atob(message.audio), c => c.charCodeAt(0));
              playAudioBuffer(audioData.buffer);
            } else if (message.type === 'transcript') {
              setTranscript(prev => [...prev, `${message.speaker}: ${message.text}`]);
            }
          }
        } catch (error) {
          console.error('[AUDIO] Message processing error:', error);
        }
      };

      websocket.onerror = (error) => {
        console.error('[AUDIO] WebSocket error:', error);
        clearTimeout(connectionTimeout);
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

  const toggleRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Not Connected",
        description: "Start session first",
        variant: "destructive"
      });
      return;
    }

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      
      wsRef.current.send(JSON.stringify({
        type: 'audio_input_complete'
      }));
    } else {
      if (mediaRecorderRef.current?.state === 'inactive') {
        mediaRecorderRef.current.start(100);
        setIsRecording(true);
        
        wsRef.current.send(JSON.stringify({
          type: 'start_conversation'
        }));
      }
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
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    setIsRecording(false);
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
          <span>GPT-4o Voice Session - {patientName}</span>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Control Buttons */}
        <div className="flex gap-2 justify-center">
          {status === 'idle' && (
            <Button onClick={startSession} className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Start Session
            </Button>
          )}
          
          {status === 'connected' && (
            <>
              <Button
                onClick={toggleRecording}
                variant={isRecording ? "destructive" : "default"}
                className="flex items-center gap-2"
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </Button>
              
              <Button onClick={endSession} variant="outline" className="flex items-center gap-2">
                <PhoneOff className="w-4 h-4" />
                End Session
              </Button>
            </>
          )}
          
          {(status === 'connecting' || status === 'error') && (
            <Button onClick={startSession} variant="outline">
              Retry Connection
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

        {/* Instructions */}
        <div className="text-sm text-gray-600 text-center">
          {status === 'idle' && "Click 'Start Session' to begin the GPT-4o voice conversation"}
          {status === 'connecting' && "Establishing secure connection to GPT-4o..."}
          {status === 'connected' && !isRecording && "Click 'Start Recording' to speak with GPT-4o"}
          {status === 'connected' && isRecording && "Speak now - GPT-4o is listening"}
          {status === 'error' && "Connection failed. Please try again"}
        </div>
      </CardContent>
    </Card>
  );
}