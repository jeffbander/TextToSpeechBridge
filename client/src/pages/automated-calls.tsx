import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Phone, Clock, User, AlertTriangle, CheckCircle, XCircle, MessageSquare, TestTube2 } from 'lucide-react';
import { format } from 'date-fns';
import Navigation from '@/components/navigation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { safeFind, isEmpty } from '@/lib/safe-arrays';
import type { Patient } from '@/../../shared/schema';

interface AutomatedCall {
  id: number;
  patientId: number;
  status: string;
  callType: string;
  duration: number | null;
  twilioCallSid: string | null;
  startedAt: string;
  completedAt: string | null;
  metadata: {
    urgencyLevel?: string;
    visitReason?: string;
    medications?: string[];
  };
}

export default function AutomatedCallsPage() {
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [urgencyLevel, setUrgencyLevel] = useState<string>('medium');
  const [visitReason, setVisitReason] = useState<string>('');
  const [medications, setMedications] = useState<string>('');
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [useCustomPrompt, setUseCustomPrompt] = useState<boolean>(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patients = [], isLoading: patientsLoading, error: patientsError } = useQuery<Patient[]>({
    queryKey: ['/api/patients'],
    retry: 3,
    staleTime: 30000,
  });

  const { data: automatedCalls = [], isLoading: callsLoading, error: callsError } = useQuery<AutomatedCall[]>({
    queryKey: ['/api/twilio/automated-calls'],
    retry: 3,
    staleTime: 30000,
  });

  const startCallMutation = useMutation({
    mutationFn: async (callData: any) => {
      const response = await apiRequest('POST', '/api/twilio/automated-calls', callData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Call Initiated",
        description: `Automated call started for patient. Call ID: ${data.callId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/twilio/automated-calls'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Call Failed",
        description: error.message || "Failed to start automated call",
        variant: "destructive",
      });
    },
  });

  // Generate custom prompt for selected patient
  const generatePromptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatientId) throw new Error('No patient selected');
      
      const medicationList = medications.split(',').map(m => m.trim()).filter(Boolean);
      
      const response = await fetch(`/api/patients/${selectedPatientId}/generate-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          recentVisitReason: visitReason,
          customMedications: medicationList,
          urgencyLevel,
          customInstructions
        })
      });
      if (!response.ok) throw new Error('Failed to generate prompt');
      return response.json();
    },
    onSuccess: (prompt) => {
      setGeneratedPrompt(prompt);
      setUseCustomPrompt(true);
      toast({
        title: "Custom Prompt Generated",
        description: `Personalized conversation script created for ${prompt.patientName}`
      });
    },
    onError: () => {
      toast({
        title: "Prompt Generation Failed",
        description: "Could not generate custom prompt",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setSelectedPatientId(null);
    setUrgencyLevel('medium');
    setVisitReason('');
    setMedications('');
    setCustomInstructions('');
    setUseCustomPrompt(false);
    setGeneratedPrompt(null);
  };

  const handleStartCall = () => {
    if (!selectedPatientId) {
      toast({
        title: "Patient Required",
        description: "Please select a patient before starting the call",
        variant: "destructive",
      });
      return;
    }

    const medicationList = medications
      .split(',')
      .map(med => med.trim())
      .filter(med => med.length > 0);

    startCallMutation.mutate({
      patientId: selectedPatientId,
      urgencyLevel,
      visitReason: visitReason || undefined,
      medications: medicationList.length > 0 ? medicationList : undefined,
      customInstructions: customInstructions || undefined,
      useCustomPrompt,
      generatedPrompt: useCustomPrompt ? generatedPrompt : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'in-progress':
      case 'answered':
        return <Badge className="bg-blue-500"><Phone className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'failed':
      case 'busy':
      case 'no-answer':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'calling':
      case 'ringing':
        return <Badge className="bg-yellow-500"><Phone className="w-3 h-3 mr-1" />Calling</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-500"><AlertTriangle className="w-3 h-3 mr-1" />High</Badge>;
      case 'medium':
        return <Badge className="bg-blue-500">Medium</Badge>;
      case 'low':
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="secondary">{urgency}</Badge>;
    }
  };

  const selectedPatient = safeFind(patients, p => p.id === selectedPatientId);

  // Error handling for failed data fetches
  if (patientsError || callsError) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
              <p className="text-muted-foreground mb-4">
                Unable to load patient data. Please check your connection and try again.
              </p>
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Automated Patient Calls</h1>
            <p className="text-muted-foreground">
              AI-powered patient follow-up calls using GPT-4o and Twilio integration
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Start New Automated Call</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="w-full">
                  <Phone className="w-4 h-4 mr-2" />
                  Initiate Automated Patient Call
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Configure Automated Call</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="patient">Select Patient</Label>
                    <Select value={selectedPatientId?.toString() || ''} onValueChange={(value) => setSelectedPatientId(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={patient.id.toString()}>
                            {patient.firstName} {patient.lastName} - {patient.condition}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="urgency">Urgency Level</Label>
                    <Select value={urgencyLevel} onValueChange={setUrgencyLevel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low - Routine Check-in</SelectItem>
                        <SelectItem value="medium">Medium - Standard Follow-up</SelectItem>
                        <SelectItem value="high">High - Important Follow-up</SelectItem>
                        <SelectItem value="critical">Critical - Urgent Medical Concern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="visit-reason">Recent Visit Reason (Optional)</Label>
                    <Input
                      id="visit-reason"
                      value={visitReason}
                      onChange={(e) => setVisitReason(e.target.value)}
                      placeholder="e.g., Cardiac consultation, medication adjustment"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="medications">Current Medications (Optional)</Label>
                    <Textarea
                      id="medications"
                      value={medications}
                      onChange={(e) => setMedications(e.target.value)}
                      placeholder="Enter medications separated by commas"
                      className="h-20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instructions">Special Instructions (Optional)</Label>
                    <Textarea
                      id="instructions"
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="Any special considerations for this patient..."
                      className="h-16"
                    />
                  </div>

                  {/* Custom Prompt Section */}
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="font-medium">AI Conversation Script</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generatePromptMutation.mutate()}
                        disabled={!selectedPatientId || generatePromptMutation.isPending}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        {generatePromptMutation.isPending ? 'Generating...' : 'Generate Custom Prompt'}
                      </Button>
                    </div>
                    
                    {generatedPrompt && useCustomPrompt && (
                      <div className="bg-green-50 border border-green-200 rounded p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-800">
                            Custom prompt ready for {generatedPrompt.patientName}
                          </span>
                        </div>
                        <div className="text-xs text-green-700">
                          Personalized greeting, {generatedPrompt.followUpQuestions?.length || 0} follow-up questions, 
                          and {generatedPrompt.escalationTriggers?.length || 0} escalation triggers configured.
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 text-green-700 hover:text-green-800"
                          onClick={() => setUseCustomPrompt(false)}
                        >
                          Use Standard Prompt Instead
                        </Button>
                      </div>
                    )}
                    
                    {!useCustomPrompt && (
                      <div className="text-xs text-muted-foreground">
                        Standard GPT-4o conversation script will be used. Generate a custom prompt for more personalized interactions.
                      </div>
                    )}
                  </div>

                  {selectedPatient && (
                    <div className="p-3 bg-muted rounded-lg">
                      <h4 className="font-medium">Selected Patient:</h4>
                      <p className="text-sm text-muted-foreground">
                        {selectedPatient.firstName} {selectedPatient.lastName} - {selectedPatient.phoneNumber}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Condition: {selectedPatient.condition}
                      </p>
                    </div>
                  )}

                  <div className="sticky bottom-0 bg-background pt-4 border-t">
                    <Button 
                      onClick={handleStartCall} 
                      disabled={startCallMutation.isPending || !selectedPatientId}
                      className="w-full"
                    >
                      {startCallMutation.isPending ? 'Initiating Call...' : 'Start Automated Call'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Call History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Automated Calls</CardTitle>
          </CardHeader>
          <CardContent>
            {callsLoading ? (
              <div className="text-center py-8">Loading call history...</div>
            ) : isEmpty(automatedCalls) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No automated calls found</p>
                <p className="text-sm">Start your first automated patient call above</p>
              </div>
            ) : (
              <div className="space-y-4">
                {automatedCalls?.map((call) => {
                  const patient = safeFind(patients, p => p.id === call.patientId);
                  return (
                    <div key={call.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-blue-600" />
                            <span className="font-medium">{patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient'}</span>
                            {call.metadata.urgencyLevel && getUrgencyBadge(call.metadata.urgencyLevel)}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(call.startedAt), 'MMM d, yyyy h:mm a')}
                            </div>
                            {call.duration && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {call.duration}s
                              </div>
                            )}
                            {call.metadata.visitReason && (
                              <div className="text-xs bg-muted px-2 py-1 rounded">
                                {call.metadata.visitReason}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {getStatusBadge(call.status)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}