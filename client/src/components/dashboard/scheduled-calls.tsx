import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Edit, Plus, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ScheduledCallsProps {
  calls: any[];
  isLoading: boolean;
}

export default function ScheduledCalls({ calls, isLoading }: ScheduledCallsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startCallMutation = useMutation({
    mutationFn: async ({ patientId, callType }: { patientId: number; callType: string }) => {
      return apiRequest('POST', '/api/calls/start', { patientId, callType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/scheduled'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({
        title: "Call started",
        description: "The call has been initiated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start the call. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatScheduledTime = (scheduledTime: string) => {
    const date = new Date(scheduledTime);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    
    const timeString = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    if (isToday) return `Today, ${timeString}`;
    if (isTomorrow) return `Tomorrow, ${timeString}`;
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const isCallTime = (scheduledTime: string) => {
    const now = new Date();
    const scheduled = new Date(scheduledTime);
    return scheduled <= now;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-20 mb-1" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="flex items-center space-x-2">
                <Skeleton className="h-6 w-6" />
                <Skeleton className="h-6 w-6" />
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
          <CardTitle className="text-lg font-semibold">Scheduled Calls</CardTitle>
          <Button variant="ghost" size="sm">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No scheduled calls</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map((call) => (
              <div key={call.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{call.patientName}</p>
                  <p className="text-xs text-gray-500">{formatScheduledTime(call.scheduledTime)}</p>
                  <p className="text-xs text-gray-400">{call.callType}</p>
                </div>
                <div className="flex items-center space-x-2">
                  {isCallTime(call.scheduledTime) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startCallMutation.mutate({
                        patientId: call.patientId,
                        callType: call.callType
                      })}
                      disabled={startCallMutation.isPending}
                    >
                      <Phone className="w-4 h-4 text-medical-blue" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled>
                      <Clock className="w-4 h-4 text-gray-400" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm">
                    <Edit className="w-4 h-4 text-gray-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
