import { useQueryClient } from '@tanstack/react-query';

export function useWebSocket() {
  const queryClient = useQueryClient();

  // Simple polling instead of WebSocket to eliminate connection errors
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
  }, 30000);

  return null;
}
