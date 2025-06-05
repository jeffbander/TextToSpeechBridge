import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Headphones, PhoneOff, UserCheck, Pause, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ActiveCallsProps {
  calls: any[];
  isLoading: boolean;
  onListenToCall: (callId: number) => void;
}

export default function ActiveCalls({ calls, isLoading, onListenToCall }: ActiveCallsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const endCallMutation = useMutation({
    mutationFn: async (callId: number) => {
      return apiRequest('POST', `/api/calls/${callId}/end`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({
        title: "Call ended",
        description: "The call has been successfully ended.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to end the call. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatDuration = (startedAt: string) => {
    if (!startedAt) return "00:00";
    const start = new Date(startedAt);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    const minutes = Math.floor(diffInSeconds / 60);
    const seconds = diffInSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Active Calls</CardTitle>
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse mr-2"></div>
              <span className="text-sm text-gray-500">Live</span>
            </div>
            <Button variant="outline" size="sm">
              <Pause className="w-4 h-4 mr-1" />
              Pause All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No active calls at the moment</p>
          </div>
        ) : (
          <div className="space-y-4">
            {calls.map((call) => (
              <div 
                key={call.id} 
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  call.alertLevel === 'urgent' ? 'border-warning bg-orange-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      call.alertLevel === 'urgent' ? 'bg-orange-100' : 'bg-medical-blue-light'
                    }`}>
                      {call.alertLevel === 'urgent' ? (
                        <AlertTriangle className="text-warning" />
                      ) : (
                        <Phone className="text-medical-blue" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{call.patientName}</p>
                    <p className="text-sm text-gray-500">{call.phoneNumber}</p>
                    <p className="text-xs text-gray-400">{call.condition}</p>
                    {call.alertLevel === 'urgent' && call.aiAnalysis && (
                      <p className="text-xs text-warning font-medium mt-1">
                        ⚠️ {call.aiAnalysis.summary}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatDuration(call.startedAt)}
                    </p>
                    <p className="text-xs text-gray-500">Duration</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onListenToCall(call.id)}
                    >
                      <Headphones className="w-4 h-4" />
                    </Button>
                    {call.alertLevel === 'urgent' && (
                      <Button variant="outline" size="sm">
                        <UserCheck className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => endCallMutation.mutate(call.id)}
                      disabled={endCallMutation.isPending}
                    >
                      <PhoneOff className="w-4 h-4 text-error" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
