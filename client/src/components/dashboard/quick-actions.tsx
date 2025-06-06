import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Upload, Settings, BarChart, Bot } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function QuickActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startBatchCallsMutation = useMutation({
    mutationFn: async () => {
      // For demo purposes, using sample patient IDs
      const samplePatientIds = [1, 2, 3, 4, 5];
      return apiRequest('POST', '/api/calls/batch', {
        patientIds: samplePatientIds,
        callType: 'routine-followup'
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/calls/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      toast({
        title: "Batch calls initiated",
        description: `Started calls for ${data.total} patients.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start batch calls. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleBatchCalls = () => {
    if (confirm('Start batch calling for pending patients? This will begin automated outreach.')) {
      startBatchCallsMutation.mutate();
    }
  };

  const handleUploadPatientList = () => {
    toast({
      title: "Feature coming soon",
      description: "Patient list upload functionality will be available soon.",
    });
  };

  const handleConfigurePrompts = () => {
    toast({
      title: "Feature coming soon",
      description: "AI prompt configuration will be available soon.",
    });
  };

  const handleViewReports = () => {
    toast({
      title: "Feature coming soon",
      description: "Analytics dashboard will be available soon.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Link href="/realtime">
          <Button 
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
          >
            <Bot className="w-4 h-4 mr-2" />
            GPT-4o Real-time Preview
          </Button>
        </Link>
        
        <Button 
          className="w-full bg-medical-blue hover:bg-medical-blue-dark text-white"
          onClick={handleBatchCalls}
          disabled={startBatchCallsMutation.isPending}
        >
          <Phone className="w-4 h-4 mr-2" />
          {startBatchCallsMutation.isPending ? "Starting..." : "Start Batch Calls"}
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleUploadPatientList}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload Patient List
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleConfigurePrompts}
        >
          <Settings className="w-4 h-4 mr-2" />
          Configure AI Prompts
        </Button>
        
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleViewReports}
        >
          <BarChart className="w-4 h-4 mr-2" />
          View Reports
        </Button>
      </CardContent>
    </Card>
  );
}
