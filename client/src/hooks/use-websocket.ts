import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export function useWebSocket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          switch (message.type) {
            case 'callStarted':
              queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
              queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
              toast({
                title: "Call started",
                description: `Call initiated for ${message.data.call.patientName}`,
              });
              break;
              
            case 'callEnded':
              queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
              queryClient.invalidateQueries({ queryKey: ['/api/calls/recent'] });
              queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
              break;
              
            case 'callUpdated':
              queryClient.invalidateQueries({ queryKey: ['/api/calls', message.data.callId] });
              queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
              break;
              
            case 'alertCreated':
              queryClient.invalidateQueries({ queryKey: ['/api/alerts/urgent'] });
              queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
              
              if (message.data.alert.type === 'urgent') {
                toast({
                  title: "🚨 Urgent Alert",
                  description: `${message.data.patient.name}: ${message.data.alert.message}`,
                  variant: "destructive",
                });
              }
              break;
              
            default:
              console.log('Unknown WebSocket message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            useWebSocket(); // Reconnect
          }
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient, toast]);

  return wsRef.current;
}
