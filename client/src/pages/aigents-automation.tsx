import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Bot, Play, Clock, CheckCircle, XCircle, FileText, User, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const automationFormSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  chainToRun: z.string().min(1, "Chain selection is required"),
  firstStepInput: z.string().optional(),
  additionalVariables: z.string().optional()
});

type AutomationFormData = z.infer<typeof automationFormSchema>;

interface AutomationLog {
  id: number;
  patientId?: number;
  chainRunId: string;
  chainToRun: string;
  sourceId?: string;
  firstStepInput?: string;
  startingVariables?: any;
  agentResponse?: string;
  agentName?: string;
  status: string;
  responsePayload?: any;
  triggeredAt: string;
  completedAt?: string;
}

const AUTOMATION_CHAINS = [
  { value: "Pre Pre chart", label: "Pre Pre Chart" },
  { value: "ATTACHMENT PROCESSING (LABS)", label: "Attachment Processing (Labs)" },
  { value: "ATTACHMENT PROCESSING (SLEEP STUDY)", label: "Attachment Processing (Sleep Study)" },
  { value: "MEDICATION RECONCILIATION", label: "Medication Reconciliation" },
  { value: "DISCHARGE SUMMARY", label: "Discharge Summary" }
];

// Utility function to generate Source ID from patient data
const generateSourceId = (firstName: string, lastName: string, dob: string) => {
  if (!firstName || !lastName || !dob) return '';
  
  const formattedFirstName = firstName.trim().replace(/\s+/g, '_');
  const formattedLastName = lastName.trim().replace(/\s+/g, '_');
  
  // Convert YYYY-MM-DD to MM_DD_YYYY
  const dobFormatted = dob.split('-').length === 3 
    ? `${dob.split('-')[1]}_${dob.split('-')[2]}_${dob.split('-')[0]}`
    : dob.replace(/\//g, '_');
  
  return `${formattedLastName}_${formattedFirstName}__${dobFormatted}`;
};

// Frontend automation trigger function
const triggerAIGENTSAutomation = async (params: any) => {
  const {
    email = "jeffrey.Bander@providerloop.com",
    chainToRun,
    sourceId,
    firstStepInput,
    startingVariables = {}
  } = params;

  const requestBody = {
    run_email: email,
    chain_to_run: chainToRun,
    human_readable_record: "CardioCare AI System",
    ...(sourceId && { source_id: sourceId }),
    ...(firstStepInput && { first_step_user_input: firstStepInput }),
    starting_variables: startingVariables
  };

  try {
    const response = await fetch("https://start-chain-run-943506065004.us-central1.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const result = await response.text();
    
    // Extract Chain Run ID from response
    let chainRunId = '';
    try {
      const chainRunMatch = result.match(/"ChainRun_ID"\s*:\s*"([^"]+)"/);
      if (chainRunMatch) {
        chainRunId = chainRunMatch[1];
      }
    } catch (e) {
      console.log('Could not extract ChainRun_ID from response');
    }

    return {
      success: response.ok,
      chainRunId,
      response: result,
      status: response.ok ? 'success' : 'error'
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
};

export default function AIGENTSAutomation() {
  const [isAutomationDialogOpen, setIsAutomationDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: patients = [], isLoading: patientsLoading } = useQuery<any[]>({
    queryKey: ['/api/patients'],
    retry: 3,
    staleTime: 30000,
  });

  const { data: automationLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<AutomationLog[]>({
    queryKey: ['/api/automation-logs'],
    retry: 3,
    staleTime: 10000,
  });

  const form = useForm<AutomationFormData>({
    resolver: zodResolver(automationFormSchema),
    defaultValues: {
      patientId: "",
      chainToRun: "",
      firstStepInput: "",
      additionalVariables: ""
    },
  });

  const triggerAutomationMutation = useMutation({
    mutationFn: async (data: AutomationFormData) => {
      const selectedPatient = patients.find(p => p.id.toString() === data.patientId);
      if (!selectedPatient) {
        throw new Error("Patient not found");
      }

      // Generate source ID from patient data
      const sourceId = generateSourceId(
        selectedPatient.firstName, 
        selectedPatient.lastName, 
        selectedPatient.dateOfBirth
      );

      // Parse additional variables
      let additionalVars = {};
      if (data.additionalVariables) {
        try {
          additionalVars = JSON.parse(data.additionalVariables);
        } catch (e) {
          // If not valid JSON, treat as simple key-value
          additionalVars = { custom_input: data.additionalVariables };
        }
      }

      const startingVariables = {
        patient_id: selectedPatient.id,
        patient_name: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
        mrn: selectedPatient.mrn,
        phone_number: selectedPatient.phoneNumber,
        condition: selectedPatient.condition,
        risk_level: selectedPatient.riskLevel,
        ...additionalVars
      };

      // Log the automation in our database first
      const logEntry = {
        patientId: selectedPatient.id,
        chainRunId: `pending_${Date.now()}`, // Temporary ID
        chainToRun: data.chainToRun,
        sourceId,
        firstStepInput: data.firstStepInput || null,
        startingVariables,
        status: 'pending'
      };

      await apiRequest('POST', '/api/automation-logs', logEntry);

      // Trigger the AIGENTS automation
      const result = await triggerAIGENTSAutomation({
        chainToRun: data.chainToRun,
        sourceId,
        firstStepInput: data.firstStepInput,
        startingVariables
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to trigger automation');
      }

      // Update the log with the actual Chain Run ID
      if (result.chainRunId) {
        // Update our log with real Chain Run ID
        // Note: This would require an update endpoint
      }

      return result;
    },
    onSuccess: (result) => {
      toast({
        title: "Automation Triggered",
        description: `Chain Run ID: ${result.chainRunId}`,
      });
      setIsAutomationDialogOpen(false);
      form.reset();
      refetchLogs();
    },
    onError: (error: any) => {
      toast({
        title: "Automation Failed",
        description: error.message || "Failed to trigger automation",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AutomationFormData) => {
    triggerAutomationMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AIGENTS Automation</h1>
            <p className="text-muted-foreground">
              Trigger automated workflows and view automation results
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Bot className="h-8 w-8 text-blue-600" />
            <Dialog open={isAutomationDialogOpen} onOpenChange={setIsAutomationDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Play className="h-4 w-4" />
                  Trigger Automation
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Automations</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{automationLogs.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {automationLogs.filter(log => log.status === 'completed').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {automationLogs.filter(log => log.status === 'pending').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {automationLogs.filter(log => log.status === 'failed').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Automation Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Automations</CardTitle>
            <CardDescription>
              Track the status and results of triggered automations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading automation logs...
              </div>
            ) : automationLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No automations triggered yet</p>
                <p className="text-sm">Start by triggering your first automation</p>
              </div>
            ) : (
              <div className="space-y-4">
                {automationLogs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border ${getStatusColor(log.status)}`}>
                          {getStatusIcon(log.status)}
                          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                        </div>
                        <div className="font-medium">{log.chainToRun}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(log.triggeredAt), 'MMM dd, yyyy HH:mm')}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="font-medium text-muted-foreground">Chain Run ID</div>
                        <div className="font-mono text-xs">{log.chainRunId}</div>
                      </div>
                      {log.sourceId && (
                        <div>
                          <div className="font-medium text-muted-foreground">Source ID</div>
                          <div className="font-mono text-xs">{log.sourceId}</div>
                        </div>
                      )}
                      {log.agentName && (
                        <div>
                          <div className="font-medium text-muted-foreground">Agent</div>
                          <div>{log.agentName}</div>
                        </div>
                      )}
                    </div>

                    {log.firstStepInput && (
                      <div>
                        <div className="font-medium text-muted-foreground text-sm">Input</div>
                        <div className="text-sm bg-muted p-2 rounded">{log.firstStepInput}</div>
                      </div>
                    )}

                    {log.agentResponse && (
                      <div>
                        <div className="font-medium text-muted-foreground text-sm">Response</div>
                        <div className="text-sm bg-muted p-2 rounded">{log.agentResponse}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trigger Automation Dialog */}
        <Dialog open={isAutomationDialogOpen} onOpenChange={setIsAutomationDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Trigger AIGENTS Automation</DialogTitle>
              <DialogDescription>
                Select a patient and automation chain to process their data
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Patient *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a patient" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {patients.map((patient) => (
                            <SelectItem key={patient.id} value={patient.id.toString()}>
                              {patient.firstName} {patient.lastName} - {patient.mrn}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="chainToRun"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Automation Chain *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select automation chain" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {AUTOMATION_CHAINS.map((chain) => (
                            <SelectItem key={chain.value} value={chain.value}>
                              {chain.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="firstStepInput"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Step Input</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Initial input for the automation (optional)"
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="additionalVariables"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Variables (JSON)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder='{"custom_field": "value", "priority": "high"}'
                          className="min-h-[80px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsAutomationDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={triggerAutomationMutation.isPending}>
                    {triggerAutomationMutation.isPending ? "Triggering..." : "Trigger Automation"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}