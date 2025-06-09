import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { User, MessageSquare, Settings, Save, Eye, TestTube, Brain } from 'lucide-react';
import Navigation from '@/components/navigation';
import type { Patient } from '@shared/schema';

interface PromptMetadata {
  conversationStyle?: 'professional' | 'warm' | 'clinical' | 'empathetic';
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
  focusAreas?: string[];
  specificQuestions?: string[];
  escalationTriggers?: string[];
  medicationInstructions?: string[];
  followUpActions?: string[];
  voiceTone?: 'formal' | 'friendly' | 'compassionate' | 'authoritative';
  conversationLength?: 'brief' | 'standard' | 'detailed';
  redFlags?: string[];
  culturalConsiderations?: string;
  languagePreference?: string;
}

interface PatientPromptData {
  customPrompt: string;
  promptMetadata: PromptMetadata;
}

export default function PatientPromptsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [promptData, setPromptData] = useState<PatientPromptData>({
    customPrompt: '',
    promptMetadata: {
      conversationStyle: 'professional',
      urgencyLevel: 'medium',
      focusAreas: [],
      specificQuestions: [],
      escalationTriggers: [],
      medicationInstructions: [],
      followUpActions: [],
      voiceTone: 'friendly',
      conversationLength: 'standard',
      redFlags: [],
      culturalConsiderations: '',
      languagePreference: 'English'
    }
  });

  // Fetch patients
  const { data: patients = [], isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ['/api/patients'],
  });

  // Get selected patient data
  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  // Load patient's existing prompt
  const { data: existingPrompt, isLoading: promptLoading } = useQuery({
    queryKey: [`/api/patients/${selectedPatientId}/prompt`],
    enabled: !!selectedPatientId,
  });

  // Update prompt data when existing prompt is loaded
  React.useEffect(() => {
    if (existingPrompt && typeof existingPrompt === 'object') {
      const prompt = existingPrompt as any;
      setPromptData({
        customPrompt: prompt.customPrompt || '',
        promptMetadata: prompt.promptMetadata || promptData.promptMetadata
      });
    }
  }, [existingPrompt]);

  // Save prompt mutation
  const savePromptMutation = useMutation({
    mutationFn: async (data: PatientPromptData) => {
      const response = await fetch(`/api/patients/${selectedPatientId}/prompt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to save prompt');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Patient prompt saved successfully"
      });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${selectedPatientId}/prompt`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save prompt",
        variant: "destructive"
      });
    }
  });

  // Test prompt mutation
  const testPromptMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/patients/${selectedPatientId}/test-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptData)
      });
      if (!response.ok) throw new Error('Failed to test prompt');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Complete",
        description: `Prompt test completed: ${data.result}`
      });
    }
  });

  const handleSave = () => {
    if (!selectedPatientId) {
      toast({
        title: "No Patient Selected",
        description: "Please select a patient first",
        variant: "destructive"
      });
      return;
    }
    savePromptMutation.mutate(promptData);
  };

  const handleTest = () => {
    if (!selectedPatientId) {
      toast({
        title: "No Patient Selected",
        description: "Please select a patient first",
        variant: "destructive"
      });
      return;
    }
    testPromptMutation.mutate();
  };

  const updateMetadata = (key: keyof PromptMetadata, value: any) => {
    setPromptData(prev => ({
      ...prev,
      promptMetadata: {
        ...prev.promptMetadata,
        [key]: value
      }
    }));
  };

  const addArrayItem = (key: keyof PromptMetadata, value: string) => {
    if (!value.trim()) return;
    setPromptData(prev => ({
      ...prev,
      promptMetadata: {
        ...prev.promptMetadata,
        [key]: [...(prev.promptMetadata[key] as string[] || []), value.trim()]
      }
    }));
  };

  const removeArrayItem = (key: keyof PromptMetadata, index: number) => {
    setPromptData(prev => ({
      ...prev,
      promptMetadata: {
        ...prev.promptMetadata,
        [key]: (prev.promptMetadata[key] as string[] || []).filter((_, i) => i !== index)
      }
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Patient Prompt Manager</h1>
            <p className="text-muted-foreground">
              Create custom conversation prompts and configurations for each patient's AI interactions
            </p>
          </div>

          {/* Patient Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Select Patient
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedPatientId?.toString() || ''}
                onValueChange={(value) => setSelectedPatientId(parseInt(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a patient to customize their conversation prompt" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id.toString()}>
                      {patient.firstName} {patient.lastName} - {patient.condition}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedPatient && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <h3 className="font-semibold">{selectedPatient.firstName} {selectedPatient.lastName}</h3>
                  <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                    <div>
                      <span className="font-medium">Condition:</span> {selectedPatient.condition}
                    </div>
                    <div>
                      <span className="font-medium">Risk Level:</span> 
                      <Badge variant={selectedPatient.riskLevel === 'high' ? 'destructive' : 'default'} className="ml-2">
                        {selectedPatient.riskLevel}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">MRN:</span> {selectedPatient.mrn}
                    </div>
                    <div>
                      <span className="font-medium">Phone:</span> {selectedPatient.phoneNumber}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedPatientId && (
            <Tabs defaultValue="prompt" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="prompt">Custom Prompt</TabsTrigger>
                <TabsTrigger value="configuration">Configuration</TabsTrigger>
                <TabsTrigger value="preview">Preview & Test</TabsTrigger>
              </TabsList>

              {/* Custom Prompt Tab */}
              <TabsContent value="prompt" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Custom Conversation Prompt
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="customPrompt">System Prompt for GPT-4o Real-time</Label>
                      <Textarea
                        id="customPrompt"
                        placeholder={`Create a detailed conversation prompt for ${selectedPatient?.firstName || 'this patient'}. Include specific instructions for:
- How to greet the patient
- What questions to ask based on their condition
- How to handle their responses
- When to escalate concerns
- Conversation flow and tone

Example: "You are conducting a follow-up call with ${selectedPatient?.firstName || 'the patient'}. Start by asking about their recovery from [condition]. Focus on [specific symptoms]. If they mention [red flags], immediately..."`}
                        value={promptData.customPrompt}
                        onChange={(e) => setPromptData(prev => ({ ...prev, customPrompt: e.target.value }))}
                        rows={15}
                        className="font-mono text-sm"
                      />
                      <p className="text-sm text-muted-foreground mt-2">
                        This prompt will be used by GPT-4o during real-time voice conversations with this patient.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Configuration Tab */}
              <TabsContent value="configuration" className="space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Basic Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Basic Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Conversation Style</Label>
                        <Select
                          value={promptData.promptMetadata.conversationStyle}
                          onValueChange={(value) => updateMetadata('conversationStyle', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="professional">Professional</SelectItem>
                            <SelectItem value="warm">Warm & Caring</SelectItem>
                            <SelectItem value="clinical">Clinical</SelectItem>
                            <SelectItem value="empathetic">Empathetic</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Voice Tone</Label>
                        <Select
                          value={promptData.promptMetadata.voiceTone}
                          onValueChange={(value) => updateMetadata('voiceTone', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="formal">Formal</SelectItem>
                            <SelectItem value="friendly">Friendly</SelectItem>
                            <SelectItem value="compassionate">Compassionate</SelectItem>
                            <SelectItem value="authoritative">Authoritative</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Conversation Length</Label>
                        <Select
                          value={promptData.promptMetadata.conversationLength}
                          onValueChange={(value) => updateMetadata('conversationLength', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="brief">Brief (2-3 minutes)</SelectItem>
                            <SelectItem value="standard">Standard (5-7 minutes)</SelectItem>
                            <SelectItem value="detailed">Detailed (10+ minutes)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Urgency Level</Label>
                        <Select
                          value={promptData.promptMetadata.urgencyLevel}
                          onValueChange={(value) => updateMetadata('urgencyLevel', value)}
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
                    </CardContent>
                  </Card>

                  {/* Advanced Settings */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Advanced Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="languagePreference">Language Preference</Label>
                        <Input
                          id="languagePreference"
                          value={promptData.promptMetadata.languagePreference || ''}
                          onChange={(e) => updateMetadata('languagePreference', e.target.value)}
                          placeholder="English, Spanish, etc."
                        />
                      </div>

                      <div>
                        <Label htmlFor="culturalConsiderations">Cultural Considerations</Label>
                        <Textarea
                          id="culturalConsiderations"
                          value={promptData.promptMetadata.culturalConsiderations || ''}
                          onChange={(e) => updateMetadata('culturalConsiderations', e.target.value)}
                          placeholder="Any cultural or religious considerations for this patient's care"
                          rows={3}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Dynamic Lists */}
                <Card>
                  <CardHeader>
                    <CardTitle>Conversation Elements</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="questions" className="space-y-4">
                      <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="questions">Specific Questions</TabsTrigger>
                        <TabsTrigger value="redflags">Red Flags</TabsTrigger>
                        <TabsTrigger value="medications">Medications</TabsTrigger>
                        <TabsTrigger value="followup">Follow-up Actions</TabsTrigger>
                      </TabsList>

                      <TabsContent value="questions">
                        <ArrayManager
                          title="Specific Questions to Ask"
                          items={promptData.promptMetadata.specificQuestions || []}
                          onAdd={(value) => addArrayItem('specificQuestions', value)}
                          onRemove={(index) => removeArrayItem('specificQuestions', index)}
                          placeholder="Enter a specific question for this patient"
                        />
                      </TabsContent>

                      <TabsContent value="redflags">
                        <ArrayManager
                          title="Red Flag Symptoms"
                          items={promptData.promptMetadata.redFlags || []}
                          onAdd={(value) => addArrayItem('redFlags', value)}
                          onRemove={(index) => removeArrayItem('redFlags', index)}
                          placeholder="Enter a red flag symptom or condition"
                        />
                      </TabsContent>

                      <TabsContent value="medications">
                        <ArrayManager
                          title="Medication Instructions"
                          items={promptData.promptMetadata.medicationInstructions || []}
                          onAdd={(value) => addArrayItem('medicationInstructions', value)}
                          onRemove={(index) => removeArrayItem('medicationInstructions', index)}
                          placeholder="Enter medication-related instructions"
                        />
                      </TabsContent>

                      <TabsContent value="followup">
                        <ArrayManager
                          title="Follow-up Actions"
                          items={promptData.promptMetadata.followUpActions || []}
                          onAdd={(value) => addArrayItem('followUpActions', value)}
                          onRemove={(index) => removeArrayItem('followUpActions', index)}
                          placeholder="Enter follow-up action or instruction"
                        />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Preview & Test Tab */}
              <TabsContent value="preview" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Prompt Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
                      {promptData.customPrompt || 'No custom prompt defined. The system will use default healthcare prompts.'}
                    </div>
                    
                    {Object.keys(promptData.promptMetadata).length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-semibold mb-2">Configuration Summary:</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><strong>Style:</strong> {promptData.promptMetadata.conversationStyle}</div>
                          <div><strong>Tone:</strong> {promptData.promptMetadata.voiceTone}</div>
                          <div><strong>Length:</strong> {promptData.promptMetadata.conversationLength}</div>
                          <div><strong>Urgency:</strong> {promptData.promptMetadata.urgencyLevel}</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex gap-4">
                  <Button onClick={handleTest} disabled={testPromptMutation.isPending}>
                    <TestTube className="w-4 h-4 mr-2" />
                    {testPromptMutation.isPending ? 'Testing...' : 'Test Prompt'}
                  </Button>
                  <Button onClick={handleSave} disabled={savePromptMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {savePromptMutation.isPending ? 'Saving...' : 'Save Prompt'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </main>
    </div>
  );
}

interface ArrayManagerProps {
  title: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
}

function ArrayManager({ title, items, onAdd, onRemove, placeholder }: ArrayManagerProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onAdd(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button onClick={handleAdd} size="sm">
          Add
        </Button>
      </div>
      
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
              <span className="text-sm">{item}</span>
              <Button
                onClick={() => onRemove(index)}
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}