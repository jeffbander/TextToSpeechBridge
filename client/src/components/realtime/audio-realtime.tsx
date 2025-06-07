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
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;
      console.log('[AUDIO] Audio context initialized');
    } catch (error) {
      console.error('[AUDIO] Failed to initialize audio context:', error);
    }
  }, []);

  const playAudioBuffer = useCallback(async (audioData: ArrayBuffer) => {
    if (!audioContextRef.current) return;
    
    try {
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
      
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, patientName, callId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }
      
      const data = await response.json();
      const wsUrl = `${data.websocketHost}${data.websocketUrl}`;
      
      console.log(`[AUDIO] Connecting to: ${wsUrl}`);
      
      const websocket = new WebSocket(wsUrl);
      wsRef.current = websocket;
      
      websocket.onopen = () => {
        console.log('[AUDIO] WebSocket connected');
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
        setStatus('error');
        toast({
          title: "Connection Error",
          description: "Failed to connect to voice session",
          variant: "destructive"
        });
      };

      websocket.onclose = () => {
        console.log('[AUDIO] Connection closed');
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

    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        
        // Create audio processing pipeline for PCM16 format
        if (!audioContextRef.current) {
          await initializeAudio();
        }
        
        const audioContext = audioContextRef.current!;
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (event) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Convert float32 to PCM16 format for OpenAI
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }
            
            // Send PCM16 audio data to server
            wsRef.current.send(JSON.stringify({
              type: 'audio_input',
              audio: Array.from(new Uint8Array(pcmData.buffer))
            }));
          }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        // Store for cleanup
        mediaRecorderRef.current = { processor, source } as any;
        setIsRecording(true);
        
        toast({
          title: "Recording",
          description: "Speak now - GPT-4o is listening"
        });
        
      } catch (error) {
        toast({
          title: "Microphone Access",
          description: "Could not access microphone",
          variant: "destructive"
        });
      }
    } else {
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      const { processor, source } = mediaRecorderRef.current as any;
      
      // Properly disconnect audio processing pipeline
      if (processor) {
        processor.disconnect();
        processor.onaudioprocess = null;
      }
      if (source) {
        source.disconnect();
      }
      
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    
    // Signal end of audio input to GPT-4o
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_input_complete'
      }));
    }
  };

  const cleanup = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
  };

  const endSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    cleanup();
    setStatus('idle');
    setTranscript([]);
    onEnd?.();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            GPT-4o Voice Session
          </CardTitle>
          <Badge className={getStatusColor()}>
            {getStatusText()}
          </Badge>
        </div>
        <p className="text-sm text-gray-600">
          Patient: {patientName}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {status === 'idle' && (
          <Button onClick={startSession} className="w-full">
            <Phone className="h-4 w-4 mr-2" />
            Start Voice Session
          </Button>
        )}
        
        {status === 'connected' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={toggleRecording}
                variant={isRecording ? "destructive" : "default"}
                className="flex-1"
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4 mr-2" />
                    Stop Speaking
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Speak to GPT-4o
                  </>
                )}
              </Button>
              
              <Button onClick={endSession} variant="outline">
                <PhoneOff className="h-4 w-4 mr-2" />
                End Session
              </Button>
            </div>
            
            {transcript.length > 0 && (
              <div className="bg-gray-50 p-3 rounded-lg max-h-40 overflow-y-auto">
                <h4 className="font-medium mb-2">Conversation:</h4>
                {transcript.map((line, idx) => (
                  <p key={idx} className="text-sm text-gray-700 mb-1">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}
        
        {status === 'connecting' && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">Connecting to GPT-4o...</p>
          </div>
        )}
        
        {status === 'error' && (
          <div className="text-center py-4">
            <p className="text-red-600 mb-4">Connection failed</p>
            <Button onClick={startSession} variant="outline">
              Retry Connection
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}