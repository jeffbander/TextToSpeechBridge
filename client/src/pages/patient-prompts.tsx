import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, MessageSquare, TestTube2, FileText, Phone, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import Navigation from "@/components/navigation";

interface Patient {
  id: number;
  name: string;
  phoneNumber: string;
  condition: string;
  riskLevel: string;
  lastDischarge: string | null;
}

interface PatientPromptRequest {
  patientId: number;
  templateId?: string;
  customConditions?: string[];
  customMedications?: string[];
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
  recentVisitReason?: string;
  customInstructions?: string;
}

interface GeneratedPatientPrompt {
  patientId: number;
  patientName: string;
  templateUsed?: string;
  systemPrompt: string;
  initialGreeting: string;
  followUpQuestions: string[];
  escalationTriggers: string[];
  closingInstructions: string;
  urgencyLevel: string;
  generatedAt: Date;
}

export default function PatientPrompts() {
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [customConfig, setCustomConfig] = useState<PatientPromptRequest>({
    patientId: 0,
    recentVisitReason: '',
    customConditions: [],
    customMedications: [],
    urgencyLevel: 'medium',
    customInstructions: ''
  });
  const [generatedPrompt, setGeneratedPrompt] = useState<GeneratedPatientPrompt | null>(null);

  // Fetch patients
  const { data: patients = [], isLoading: patientsLoading } = useQuery({
    queryKey: ['/api/patients'],
    enabled: true
  });

  // Fetch prompt templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['/api/prompt-templates'],
    enabled: true
  });

  // Generate patient-specific prompt
  const generatePromptMutation = useMutation({
    mutationFn: async (config: PatientPromptRequest) => {
      const response = await fetch(`/api/patients/${config.patientId}/generate-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!response.ok) throw new Error('Failed to generate patient prompt');
      return response.json();
    },
    onSuccess: (result) => {
      setGeneratedPrompt(result);
      toast({
        title: "Patient Prompt Generated",
        description: `Custom prompt created for ${result.patientName}`
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate patient-specific prompt",
        variant: "destructive"
      });
    }
  });

  // Test patient prompt
  const testPromptMutation = useMutation({
    mutationFn: async ({ patientId, voiceProfileId }: { patientId: number, voiceProfileId?: string }) => {
      const response = await fetch(`/api/patients/${patientId}/test-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceProfileId, scenario: customConfig })
      });
      if (!response.ok) throw new Error('Failed to test patient prompt');
      return response.json();
    },
    onSuccess: (result) => {
      setGeneratedPrompt(result);
      toast({
        title: "Prompt Tested",
        description: `Test prompt generated for ${result.patientName}`
      });
    },
    onError: () => {
      toast({
        title: "Test Failed",
        description: "Could not test patient prompt",
        variant: "destructive"
      });
    }
  });

  const handlePatientChange = (patientId: string) => {
    setSelectedPatient(patientId);
    const patient = patients.find((p: Patient) => p.id === parseInt(patientId));
    if (patient) {
      setCustomConfig({
        ...customConfig,
        patientId: patient.id,
        customConditions: [patient.condition],
        urgencyLevel: patient.riskLevel as any || 'medium'
      });
    }
  };

  const handleGeneratePrompt = () => {
    if (!selectedPatient) {
      toast({
        title: "Select Patient",
        description: "Please select a patient to generate a custom prompt",
        variant: "destructive"
      });
      return;
    }
    generatePromptMutation.mutate(customConfig);
  };

  const handleTestPrompt = () => {
    if (!selectedPatient) {
      toast({
        title: "Select Patient",
        description: "Please select a patient to test the prompt",
        variant: "destructive"
      });
      return;
    }
    testPromptMutation.mutate({ patientId: customConfig.patientId });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Text copied to clipboard"
    });
  };

  const selectedPatientData = patients.find((p: Patient) => p.id === parseInt(selectedPatient));

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Patient-Specific Prompts</h1>
            <p className="text-muted-foreground">
              Generate custom GPT-4o conversation scripts tailored to individual patients
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Patient Selection & Configuration */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Patient Selection
                  </CardTitle>
                  <CardDescription>
                    Choose a patient and customize their conversation parameters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Patient Selection */}
                  <div className="space-y-2">
                    <Label htmlFor="patient">Select Patient</Label>
                    <Select value={selectedPatient} onValueChange={handlePatientChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a patient..." />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map((patient: Patient) => (
                          <SelectItem key={patient.id} value={patient.id.toString()}>
                            {patient.name} - {patient.condition}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPatientData && (
                    <div className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{selectedPatientData.name}</span>
                        <Badge variant={selectedPatientData.riskLevel === 'high' ? 'destructive' : 'secondary'}>
                          {selectedPatientData.riskLevel} risk
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {selectedPatientData.phoneNumber}
                        </div>
                        <div>Condition: {selectedPatientData.condition}</div>
                        {selectedPatientData.lastDischarge && (
                          <div>Last Discharge: {new Date(selectedPatientData.lastDischarge).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Customization Options */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="recentVisit">Recent Visit Reason</Label>
                      <Input
                        id="recentVisit"
                        value={customConfig.recentVisitReason}
                        onChange={(e) => setCustomConfig({ ...customConfig, recentVisitReason: e.target.value })}
                        placeholder="e.g., Cardiac surgery recovery"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="urgency">Urgency Level</Label>
                      <Select 
                        value={customConfig.urgencyLevel} 
                        onValueChange={(value: 'low' | 'medium' | 'high' | 'critical') => 
                          setCustomConfig({ ...customConfig, urgencyLevel: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="medications">Current Medications (comma-separated)</Label>
                      <Input
                        id="medications"
                        value={customConfig.customMedications?.join(', ') || ''}
                        onChange={(e) => setCustomConfig({ 
                          ...customConfig, 
                          customMedications: e.target.value.split(',').map(m => m.trim()).filter(Boolean)
                        })}
                        placeholder="e.g., Metformin, Lisinopril, Aspirin"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="instructions">Special Instructions</Label>
                      <Textarea
                        id="instructions"
                        value={customConfig.customInstructions}
                        onChange={(e) => setCustomConfig({ ...customConfig, customInstructions: e.target.value })}
                        placeholder="Any special considerations for this patient..."
                        className="min-h-20"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={handleGeneratePrompt}
                      disabled={!selectedPatient || generatePromptMutation.isPending}
                      className="flex-1"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      {generatePromptMutation.isPending ? 'Generating...' : 'Generate Prompt'}
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={handleTestPrompt}
                      disabled={!selectedPatient || testPromptMutation.isPending}
                    >
                      <TestTube2 className="h-4 w-4 mr-2" />
                      Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Generated Prompt Display */}
            <div className="space-y-6">
              {generatedPrompt ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Generated Prompt for {generatedPrompt.patientName}
                    </CardTitle>
                    <CardDescription>
                      Custom GPT-4o conversation script - {generatedPrompt.urgencyLevel} urgency
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* System Prompt */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">System Prompt</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(generatedPrompt.systemPrompt)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-sm bg-muted p-3 rounded border max-h-32 overflow-y-auto">
                        {generatedPrompt.systemPrompt}
                      </div>
                    </div>

                    {/* Initial Greeting */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="font-medium">Initial Greeting</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(generatedPrompt.initialGreeting)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-sm bg-green-50 p-3 rounded border">
                        {generatedPrompt.initialGreeting}
                      </div>
                    </div>

                    {/* Follow-up Questions */}
                    <div className="space-y-2">
                      <Label className="font-medium">Follow-up Questions ({generatedPrompt.followUpQuestions.length})</Label>
                      <div className="space-y-2">
                        {generatedPrompt.followUpQuestions.map((question, index) => (
                          <div key={index} className="text-sm bg-blue-50 p-2 rounded border flex items-center justify-between">
                            <span>{index + 1}. {question}</span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => copyToClipboard(question)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Escalation Triggers */}
                    <div className="space-y-2">
                      <Label className="font-medium">Escalation Triggers</Label>
                      <div className="space-y-1">
                        {generatedPrompt.escalationTriggers.map((trigger, index) => (
                          <div key={index} className="text-sm bg-red-50 p-2 rounded border">
                            • {trigger}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Closing Instructions */}
                    <div className="space-y-2">
                      <Label className="font-medium">Closing Instructions</Label>
                      <div className="text-sm bg-purple-50 p-3 rounded border">
                        {generatedPrompt.closingInstructions}
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground pt-4 border-t">
                      Generated at: {new Date(generatedPrompt.generatedAt).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center space-y-2">
                      <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
                      <h3 className="font-medium">No Prompt Generated</h3>
                      <p className="text-sm text-muted-foreground">
                        Select a patient and click "Generate Prompt" to create a custom conversation script
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}