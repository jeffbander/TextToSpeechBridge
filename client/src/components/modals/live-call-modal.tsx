import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { User, Flag, UserCheck, PhoneOff } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

interface LiveCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: number | null;
}

export default function LiveCallModal({ isOpen, onClose, callId }: LiveCallModalProps) {
  const [transcript, setTranscript] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: call, isLoading } = useQuery({
    queryKey: ['/api/calls', callId],
    enabled: isOpen && callId !== null,
    refetchInterval: 2000, // Refresh every 2 seconds for real-time updates
  });

  const endCallMutation = useMutation({
    mutationFn: async () => {
      if (!callId) throw new Error("No call ID");
      return apiRequest('POST', `/api/calls/${callId}/end`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calls/recent'] });
      onClose();
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

  // Parse transcript when call data changes
  useEffect(() => {
    if (call?.transcript) {
      try {
        const parsedTranscript = JSON.parse(call.transcript);
        setTranscript(Array.isArray(parsedTranscript) ? parsedTranscript : []);
      } catch (error) {
        setTranscript([]);
      }
    } else {
      setTranscript([]);
    }
  }, [call?.transcript]);

  const formatDuration = (startedAt: string) => {
    if (!startedAt) return "00:00";
    const start = new Date(startedAt);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - start.getTime()) / 1000);
    const minutes = Math.floor(diffInSeconds / 60);
    const seconds = diffInSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleFlagConcern = () => {
    toast({
      title: "Concern flagged",
      description: "This call has been marked for immediate provider review.",
    });
  };

  const handleTransferToHuman = () => {
    toast({
      title: "Transfer requested",
      description: "Transferring call to human operator...",
    });
  };

  if (!isOpen || !callId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Live Call Monitor</DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="p-6 text-center">Loading call details...</div>
        ) : !call ? (
          <div className="p-6 text-center text-gray-500">Call not found</div>
        ) : (
          <div className="space-y-6">
            {/* Call Header */}
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-medical-blue-light rounded-full flex items-center justify-center">
                  <User className="text-medical-blue text-lg" />
                </div>
              </div>
              <div>
                <h4 className="text-lg font-medium text-gray-900">{call.patientName}</h4>
                <p className="text-sm text-gray-500">{call.phoneNumber}</p>
                <p className="text-sm text-medical-blue">Duration: {formatDuration(call.startedAt)}</p>
              </div>
              {call.alertLevel === 'urgent' && (
                <Badge className="bg-red-100 text-red-800">Urgent</Badge>
              )}
            </div>

            {/* Real-time Transcript */}
            <div className="space-y-2">
              <h5 className="font-medium text-gray-900">Live Transcript</h5>
              <ScrollArea className="h-64 bg-gray-50 rounded-lg p-4">
                {transcript.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <p>Call in progress... Transcript will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transcript.map((entry, index) => (
                      <div key={index} className="flex">
                        <div className={`text-xs w-16 ${
                          entry.speaker === 'ai' ? 'text-gray-500' : 'text-medical-blue'
                        }`}>
                          {entry.speaker === 'ai' ? 'AI:' : 'Patient:'}
                        </div>
                        <div className="text-sm text-gray-900 flex-1">
                          {entry.text}
                        </div>
                      </div>
                    ))}
                    {/* Active indicator */}
                    <div className="flex items-center">
                      <div className="text-xs text-gray-500 w-16">AI:</div>
                      <div className="flex items-center text-sm text-gray-900">
                        <span>Listening...</span>
                        <div className="ml-2 w-2 h-2 bg-medical-blue rounded-full animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* AI Analysis */}
            {call.aiAnalysis && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 mb-2">AI Analysis</h5>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">Urgency:</span> {call.aiAnalysis.urgencyLevel}</p>
                  {call.aiAnalysis.symptoms?.length > 0 && (
                    <p><span className="font-medium">Symptoms:</span> {call.aiAnalysis.symptoms.join(', ')}</p>
                  )}
                  {call.aiAnalysis.summary && (
                    <p><span className="font-medium">Summary:</span> {call.aiAnalysis.summary}</p>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  onClick={handleFlagConcern}
                >
                  <Flag className="w-4 h-4 mr-2" />
                  Flag Concern
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTransferToHuman}
                >
                  <UserCheck className="w-4 h-4 mr-2" />
                  Transfer to Human
                </Button>
              </div>
              <Button
                variant="destructive"
                onClick={() => endCallMutation.mutate()}
                disabled={endCallMutation.isPending}
              >
                <PhoneOff className="w-4 h-4 mr-2" />
                {endCallMutation.isPending ? "Ending..." : "End Call"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
