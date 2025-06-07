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
      
      // Build WebSocket URL using the separate WebSocket host
      const wsUrl = `${data.websocketHost}${data.websocketUrl}`;
      const startTime = new Date().toISOString();
      
      console.log(`[${startTime}][CLIENT] 🚀 STARTING WebSocket connection`);
      console.log(`[${startTime}][CLIENT] Session ID: ${data.sessionId}`);
      console.log(`[${startTime}][CLIENT] WebSocket URL: ${wsUrl}`);
      console.log(`[${startTime}][CLIENT] Browser: ${navigator.userAgent}`);
      console.log(`[${startTime}][CLIENT] Protocol: ${window.location.protocol}`);
      
      const ws = new WebSocket(wsUrl);
      console.log(`[${startTime}][CLIENT] WebSocket object created, state: ${ws.readyState}`);
      
      const connectionTimeout = setTimeout(() => {
        const timeoutTime = new Date().toISOString();
        console.error(`[${timeoutTime}][CLIENT] ⏰ CONNECTION TIMEOUT after 15 seconds`);
        console.error(`[${timeoutTime}][CLIENT] Socket state at timeout: ${ws.readyState}`);
        ws.close();
        setStatus('error');
        toast({
          title: "Connection Timeout",
          description: "WebSocket connection timed out",
          variant: "destructive"
        });
      }, 15000);
      
      ws.onopen = () => {
        const openTime = new Date().toISOString();
        clearTimeout(connectionTimeout);
        console.log(`[${openTime}][CLIENT] ✅ WebSocket connection OPENED`);
        console.log(`[${openTime}][CLIENT] Socket state: ${ws.readyState}`);
        setStatus('connected');
        toast({
          title: "Real-time Connected",
          description: "GPT-4o voice session ready",
        });
      };

      ws.onmessage = (event) => {
        const msgTime = new Date().toISOString();
        try {
          const message = JSON.parse(event.data);
          console.log(`[${msgTime}][CLIENT] 📨 MESSAGE RECEIVED:`, message);
          
          if (message.type === 'connection_established') {
            console.log(`[${msgTime}][CLIENT] ✅ Session confirmed: ${message.sessionId}`);
          }
        } catch (error) {
          console.error(`[${msgTime}][CLIENT] ❌ Message parse error:`, error);
          console.error(`[${msgTime}][CLIENT] Raw message data:`, event.data);
        }
      };

      ws.onerror = (error) => {
        const errorTime = new Date().toISOString();
        clearTimeout(connectionTimeout);
        console.error(`[${errorTime}][CLIENT] ❌ WEBSOCKET ERROR:`);
        console.error(`[${errorTime}][CLIENT] Error object:`, error);
        console.error(`[${errorTime}][CLIENT] Socket state: ${ws.readyState}`);
        console.error(`[${errorTime}][CLIENT] Socket URL: ${ws.url}`);
        setStatus('error');
        toast({
          title: "Connection Failed",
          description: "WebSocket connection failed",
          variant: "destructive"
        });
      };

      ws.onclose = (event) => {
        const closeTime = new Date().toISOString();
        clearTimeout(connectionTimeout);
        console.log(`[${closeTime}][CLIENT] 🔌 CONNECTION CLOSED`);
        console.log(`[${closeTime}][CLIENT] Close code: ${event.code}`);
        console.log(`[${closeTime}][CLIENT] Close reason: ${event.reason}`);
        console.log(`[${closeTime}][CLIENT] Was clean: ${event.wasClean}`);
        console.log(`[${closeTime}][CLIENT] Socket state: ${ws.readyState}`);
        setStatus('idle');
        
        if (event.code === 1006) {
          console.error(`[${closeTime}][CLIENT] ❌ ABNORMAL CLOSURE (1006) - Connection lost unexpectedly`);
          toast({
            title: "Connection Lost",
            description: "WebSocket connection was terminated",
            variant: "destructive"
          });
        }
      };
      
    } catch (error) {
      console.error('Session error:', error);
      setStatus('error');
      toast({
        title: "Connection Failed",
        description: (error as Error).message || "Could not establish real-time session",
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
        
        // Stop all tracks when done (cleanup)
        setTimeout(() => {
          stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
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
      case 'error': return 'Connection Failed';
      default: return 'Disconnected';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              GPT-4o Real-time Session
            </CardTitle>
            <Badge className={`${getStatusColor()} text-white`}>
              {getStatusText()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-900">Patient Information</h3>
            <p className="text-blue-700">Name: {patientName}</p>
            <p className="text-blue-700">Session ID: {callId}</p>
          </div>

          <div className="flex gap-3">
            {status === 'idle' && (
              <Button onClick={startSession} className="flex-1">
                <Phone className="h-4 w-4 mr-2" />
                Start Real-time Session
              </Button>
            )}
            
            {status === 'connecting' && (
              <Button disabled className="flex-1">
                <Phone className="h-4 w-4 mr-2 animate-pulse" />
                Connecting...
              </Button>
            )}
            
            {status === 'connected' && (
              <>
                <Button 
                  onClick={toggleRecording}
                  variant={isRecording ? "destructive" : "outline"}
                  className="flex-1"
                >
                  {isRecording ? (
                    <MicOff className="h-4 w-4 mr-2" />
                  ) : (
                    <Mic className="h-4 w-4 mr-2" />
                  )}
                  {isRecording ? 'Stop Recording' : 'Start Recording'}
                </Button>
                
                <Button onClick={endSession} variant="outline">
                  End Session
                </Button>
              </>
            )}
            
            {status === 'error' && (
              <>
                <Button onClick={startSession} variant="outline" className="flex-1">
                  Retry Connection
                </Button>
                <Button onClick={endSession} variant="outline">
                  Cancel
                </Button>
              </>
            )}
          </div>

          {status === 'connected' && (
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-green-800 text-sm">
                WebSocket connection established. The GPT-4o real-time voice session is ready for testing.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-red-800 text-sm">
                WebSocket connection failed. This may be due to network issues or server configuration.
                Check the browser console for detailed error information.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}