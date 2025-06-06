import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Phone, Mic, MicOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SimpleRealtimeProps {
  patientId: number;
  patientName: string;
  callId: number;
  onEnd?: () => void;
}

export default function SimpleRealtime({ patientId, patientName, callId, onEnd }: SimpleRealtimeProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [isRecording, setIsRecording] = useState(false);
  const { toast } = useToast();

  const startSession = async () => {
    try {
      setStatus('connecting');
      
      const response = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, patientName, callId })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      const data = await response.json();
      
      // Connect to WebSocket for real-time communication
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}${data.websocketUrl}`;
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        setStatus('connected');
        toast({
          title: "Real-time Connected",
          description: "GPT-4o voice session ready",
        });
      };
      
      ws.onerror = () => {
        setStatus('error');
        toast({
          title: "Connection Failed",
          description: "WebSocket connection failed",
          variant: "destructive"
        });
      };
      
      ws.onclose = () => {
        setStatus('idle');
      };
      
    } catch (error) {
      console.error('Session error:', error);
      setStatus('error');
      toast({
        title: "Connection Failed",
        description: "Could not establish real-time session",
        variant: "destructive"
      });
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setIsRecording(true);
        toast({
          title: "Recording Started",
          description: "Microphone is now active",
        });
        
        // Stop the stream after 5 seconds for demo
        setTimeout(() => {
          stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
          toast({
            title: "Recording Stopped",
            description: "Demo recording completed",
          });
        }, 5000);
        
      } catch (error) {
        toast({
          title: "Microphone Error",
          description: "Could not access microphone",
          variant: "destructive"
        });
      }
    } else {
      setIsRecording(false);
    }
  };

  const endSession = () => {
    setStatus('idle');
    setIsRecording(false);
    if (onEnd) onEnd();
    
    toast({
      title: "Session Ended",
      description: "Real-time session terminated",
    });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>GPT-4o Real-time Session</span>
          <Badge variant={status === 'connected' ? 'default' : 'secondary'}>
            {status}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Patient: {patientName} | Call ID: {callId}
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex gap-2 justify-center">
          {status === 'idle' && (
            <Button onClick={startSession} size="lg">
              <Bot className="mr-2 h-4 w-4" />
              Start Real-time Session
            </Button>
          )}
          
          {status === 'connecting' && (
            <Button disabled size="lg">
              <Bot className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </Button>
          )}
          
          {status === 'connected' && (
            <>
              <Button
                onClick={toggleRecording}
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
              
              <Button onClick={endSession} variant="outline" size="lg">
                <Phone className="mr-2 h-4 w-4" />
                End Session
              </Button>
            </>
          )}
          
          {status === 'error' && (
            <Button onClick={startSession} variant="destructive" size="lg">
              <Bot className="mr-2 h-4 w-4" />
              Retry Connection
            </Button>
          )}
        </div>

        <div className="text-center space-y-2">
          {status === 'connecting' && (
            <p className="text-sm text-muted-foreground">Establishing connection to GPT-4o...</p>
          )}
          {status === 'connected' && isRecording && (
            <p className="text-sm text-green-600">Live recording in progress</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600">Connection failed. Check your OpenAI API key permissions.</p>
          )}
        </div>

        <div className="text-xs text-muted-foreground space-y-1 bg-muted p-4 rounded">
          <h4 className="font-medium">Real-time Voice Features:</h4>
          <p>• Live bidirectional audio streaming</p>
          <p>• Natural conversation with voice activity detection</p>
          <p>• Healthcare-specific conversation prompts</p>
          <p>• Real-time transcription and analysis</p>
          
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-blue-800">
            <p className="font-medium">OpenAI Real-time API Access:</p>
            <p>This feature connects to OpenAI's real-time API. Ensure your OpenAI API key has access to real-time preview features. If you encounter connection issues, verify your API permissions or contact OpenAI support.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}