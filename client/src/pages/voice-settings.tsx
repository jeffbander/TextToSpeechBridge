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
import { Volume2, Play, Settings, Users, TestTube2, MessageSquare, Edit, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Navigation from "@/components/navigation";

interface VoiceProfile {
  id: string;
  name: string;
  voice: string;
  rate: string;
  pitch: string;
  language: string;
  personality: {
    tone: 'professional' | 'warm' | 'empathetic' | 'clinical';
    pace: 'slow' | 'normal' | 'brisk';
    formality: 'formal' | 'conversational' | 'friendly';
  };
  medicalSpecialty?: 'cardiology' | 'general' | 'pulmonary';
}

interface TestPromptData {
  patientName: string;
  condition: string;
  callType: 'initial' | 'followUp' | 'urgent';
  voiceProfileId: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  condition: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  systemPrompt: string;
  initialGreeting: string;
  followUpQuestions: string[];
  escalationTriggers: string[];
}

export default function VoiceSettings() {
  const { toast } = useToast();
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState<string>('');
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<PromptTemplate | null>(null);
  const [testData, setTestData] = useState<TestPromptData>({
    patientName: 'John Smith',
    condition: 'cardiac monitoring',
    callType: 'initial',
    voiceProfileId: ''
  });
  const [testResult, setTestResult] = useState<any>(null);

  // Fetch voice profiles
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<VoiceProfile[]>({
    queryKey: ['/api/voice/profiles'],
    enabled: true
  });

  // Fetch prompt templates
  const { data: promptTemplates = [], isLoading: templatesLoading } = useQuery<PromptTemplate[]>({
    queryKey: ['/api/prompt-templates'],
    enabled: true
  });

  // Test prompt generation
  const testPromptMutation = useMutation({
    mutationFn: async (data: TestPromptData) => {
      const response = await fetch('/api/prompts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to generate prompt');
      return response.json();
    },
    onSuccess: (result) => {
      setTestResult(result);
      toast({
        title: "Prompt Generated",
        description: "Voice prompt generated successfully"
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate voice prompt",
        variant: "destructive"
      });
    }
  });

  // Create prompt template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (template: Omit<PromptTemplate, 'id'>) => {
      const response = await fetch('/api/prompt-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });
      if (!response.ok) throw new Error('Failed to create template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompt-templates'] });
      toast({
        title: "Template Created",
        description: "New prompt template created successfully"
      });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Could not create prompt template",
        variant: "destructive"
      });
    }
  });

  // Update prompt template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, ...template }: PromptTemplate) => {
      const response = await fetch(`/api/prompt-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      });
      if (!response.ok) throw new Error('Failed to update template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/prompt-templates'] });
      setEditingPrompt(null);
      toast({
        title: "Template Updated",
        description: "Prompt template updated successfully"
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Could not update prompt template",
        variant: "destructive"
      });
    }
  });

  // Test prompt template mutation
  const testTemplateMutation = useMutation({
    mutationFn: async ({ templateId, patientName }: { templateId: string, patientName: string }) => {
      const response = await fetch('/api/prompt-templates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, patientName, condition: 'test', urgencyLevel: 'medium' })
      });
      if (!response.ok) throw new Error('Failed to test template');
      return response.json();
    },
    onSuccess: (result) => {
      setTestResult(result);
      toast({
        title: "Template Tested",
        description: "Prompt template tested successfully"
      });
    },
    onError: () => {
      toast({
        title: "Test Failed",
        description: "Could not test prompt template",
        variant: "destructive"
      });
    }
  });

  // Button handlers
  const handleEditTemplate = (template: PromptTemplate) => {
    setEditForm({ ...template });
    setIsEditDialogOpen(true);
  };

  const handleCreateNewTemplate = () => {
    const newTemplate: Omit<PromptTemplate, 'id'> = {
      name: 'New Template',
      condition: 'General',
      urgencyLevel: 'medium',
      systemPrompt: 'You are a healthcare AI assistant conducting a patient follow-up call.',
      initialGreeting: 'Hello [Patient], this is your healthcare team calling to check on you.',
      followUpQuestions: ['How are you feeling today?'],
      escalationTriggers: ['severe pain', 'difficulty breathing']
    };
    createTemplateMutation.mutate(newTemplate);
  };

  const handleSaveTemplate = (template: PromptTemplate) => {
    updateTemplateMutation.mutate(template);
  };

  const handleTestTemplate = (templateId: string) => {
    testTemplateMutation.mutate({ 
      templateId, 
      patientName: testData.patientName || 'John Smith' 
    });
  };

  const handleTestPrompt = () => {
    const profileId = testData.voiceProfileId || selectedProfile;
    if (!profileId) {
      toast({
        title: "Select Voice Profile",
        description: "Please select a voice profile to test",
        variant: "destructive"
      });
      return;
    }

    testPromptMutation.mutate({
      ...testData,
      voiceProfileId: profileId
    });
  };

  const selectedProfileData = profiles.find((p: VoiceProfile) => p.id === selectedProfile);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Voice Settings</h1>
        <p className="text-muted-foreground">
          Control how your AI assistant sounds and interacts with patients
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Voice Profile Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Voice Profiles
            </CardTitle>
            <CardDescription>
              Choose from pre-configured voice personalities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profilesLoading ? (
              <div className="text-sm text-muted-foreground">Loading profiles...</div>
            ) : (
              <div className="space-y-3">
                {profiles.map((profile: VoiceProfile) => (
                  <div
                    key={profile.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedProfile === profile.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedProfile(profile.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{profile.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {profile.voice} • {profile.personality?.tone || 'professional'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {profile.personality?.pace || 'normal'}
                        </Badge>
                        {profile.medicalSpecialty && (
                          <Badge variant="outline" className="text-xs">
                            {profile.medicalSpecialty}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profile Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Profile Details
            </CardTitle>
            <CardDescription>
              View configuration for selected voice profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedProfileData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Voice Engine</Label>
                    <p className="text-sm text-muted-foreground">{selectedProfileData.voice}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Language</Label>
                    <p className="text-sm text-muted-foreground">{selectedProfileData.language}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Speech Rate</Label>
                    <p className="text-sm text-muted-foreground">{selectedProfileData.rate}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Pitch</Label>
                    <p className="text-sm text-muted-foreground">{selectedProfileData.pitch}</p>
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <Label className="text-sm font-medium">Personality</Label>
                  <div className="mt-2 flex gap-2">
                    <Badge>{selectedProfileData.personality.tone}</Badge>
                    <Badge variant="secondary">{selectedProfileData.personality.pace}</Badge>
                    <Badge variant="outline">{selectedProfileData.personality.formality}</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a voice profile to view details
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Prompt Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube2 className="h-5 w-5" />
            Test Voice Prompts
          </CardTitle>
          <CardDescription>
            Generate sample conversations with different voice profiles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                value={testData.patientName}
                onChange={(e) => setTestData(prev => ({ ...prev, patientName: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div>
              <Label htmlFor="condition">Medical Condition</Label>
              <Input
                id="condition"
                value={testData.condition}
                onChange={(e) => setTestData(prev => ({ ...prev, condition: e.target.value }))}
                placeholder="cardiac monitoring"
              />
            </div>
            <div>
              <Label htmlFor="callType">Call Type</Label>
              <Select 
                value={testData.callType} 
                onValueChange={(value: any) => setTestData(prev => ({ ...prev, callType: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">Initial Call</SelectItem>
                  <SelectItem value="followUp">Follow-up Call</SelectItem>
                  <SelectItem value="urgent">Urgent Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleTestPrompt}
                disabled={testPromptMutation.isPending || !selectedProfile}
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                {testPromptMutation.isPending ? 'Generating...' : 'Test'}
              </Button>
            </div>
          </div>

          {testResult && (
            <div className="space-y-4 mt-6">
              <Separator />
              
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge>{testResult.voiceProfile}</Badge>
                  <Badge variant="secondary">{testResult.personality.tone}</Badge>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <Label className="text-sm font-medium">Generated Script</Label>
                  <Textarea
                    value={testResult.script}
                    readOnly
                    className="mt-1 min-h-[100px]"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">SSML Output (for voice synthesis)</Label>
                  <Textarea
                    value={testResult.ssml}
                    readOnly
                    className="mt-1 font-mono text-xs min-h-[120px]"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Prompts Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Patient Conversation Prompts
          </CardTitle>
          <CardDescription>
            Customize AI conversation prompts for different medical conditions and scenarios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Prompt Templates List */}
          <div className="grid gap-4">
            {templatesLoading ? (
              <div className="text-center py-8">Loading templates...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {promptTemplates.map((template) => (
                  <Card key={template.id} className="border-2 hover:border-blue-200 cursor-pointer">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{template.name}</CardTitle>
                        <Badge variant={template.urgencyLevel === 'critical' ? 'destructive' : 'secondary'}>
                          {template.urgencyLevel}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">
                        {template.condition}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Initial Greeting:</div>
                        <div className="text-xs bg-gray-50 p-2 rounded border">
                          "{template.initialGreeting}"
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <Badge variant="outline" className="text-xs">
                            {template.followUpQuestions.length} follow-up questions
                          </Badge>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 px-2"
                              onClick={() => handleTestTemplate(template.id)}
                              disabled={testTemplateMutation.isPending}
                            >
                              <TestTube2 className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 px-2"
                              onClick={() => handleEditTemplate(template)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Create New Template Button */}
            <div className="flex justify-center pt-4">
              <Button 
                variant="outline" 
                className="w-full max-w-md"
                onClick={handleCreateNewTemplate}
                disabled={createTemplateMutation.isPending}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {createTemplateMutation.isPending ? 'Creating...' : 'Create New Prompt Template'}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Quick Prompt Customization */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Quick Customization</span>
            </div>
            
            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="greeting-style">Greeting Style</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select greeting style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional & Clinical</SelectItem>
                      <SelectItem value="warm">Warm & Caring</SelectItem>
                      <SelectItem value="urgent">Direct & Urgent</SelectItem>
                      <SelectItem value="friendly">Friendly & Conversational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="question-focus">Question Focus</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Primary focus area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="symptoms">Symptom Assessment</SelectItem>
                      <SelectItem value="medication">Medication Adherence</SelectItem>
                      <SelectItem value="recovery">Recovery Progress</SelectItem>
                      <SelectItem value="lifestyle">Lifestyle & Activities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="custom-questions">Custom Follow-up Questions</Label>
                <Textarea
                  id="custom-questions"
                  placeholder="Enter custom questions, one per line..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="flex justify-end">
                <Button className="w-32">
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </main>

      {/* Template Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Prompt Template</DialogTitle>
            <DialogDescription>
              Customize the AI conversation prompts for this medical condition
            </DialogDescription>
          </DialogHeader>
          
          {editForm && (
            <div className="space-y-6 pt-4">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="templateName">Template Name</Label>
                  <Input
                    id="templateName"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="e.g., Cardiac Surgery Follow-up"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="condition">Medical Condition</Label>
                  <Input
                    id="condition"
                    value={editForm.condition}
                    onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                    placeholder="e.g., Post-cardiac surgery"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="urgencyLevel">Urgency Level</Label>
                <Select 
                  value={editForm.urgencyLevel} 
                  onValueChange={(value: 'low' | 'medium' | 'high' | 'critical') => 
                    setEditForm({ ...editForm, urgencyLevel: value })
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

              {/* System Prompt */}
              <div className="space-y-2">
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={editForm.systemPrompt}
                  onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                  placeholder="You are a healthcare AI assistant..."
                  className="min-h-20"
                />
              </div>

              {/* Initial Greeting */}
              <div className="space-y-2">
                <Label htmlFor="initialGreeting">Initial Greeting</Label>
                <Textarea
                  id="initialGreeting"
                  value={editForm.initialGreeting}
                  onChange={(e) => setEditForm({ ...editForm, initialGreeting: e.target.value })}
                  placeholder="Hello [Patient], this is your healthcare team..."
                  className="min-h-20"
                />
                <p className="text-xs text-muted-foreground">
                  Use [Patient] as a placeholder for the patient's name
                </p>
              </div>

              {/* Follow-up Questions */}
              <div className="space-y-2">
                <Label>Follow-up Questions</Label>
                <div className="space-y-2">
                  {editForm.followUpQuestions.map((question, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={question}
                        onChange={(e) => {
                          const newQuestions = [...editForm.followUpQuestions];
                          newQuestions[index] = e.target.value;
                          setEditForm({ ...editForm, followUpQuestions: newQuestions });
                        }}
                        placeholder="Enter follow-up question"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newQuestions = editForm.followUpQuestions.filter((_, i) => i !== index);
                          setEditForm({ ...editForm, followUpQuestions: newQuestions });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditForm({ 
                        ...editForm, 
                        followUpQuestions: [...editForm.followUpQuestions, ''] 
                      });
                    }}
                  >
                    Add Question
                  </Button>
                </div>
              </div>

              {/* Escalation Triggers */}
              <div className="space-y-2">
                <Label>Escalation Triggers</Label>
                <div className="space-y-2">
                  {editForm.escalationTriggers.map((trigger, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={trigger}
                        onChange={(e) => {
                          const newTriggers = [...editForm.escalationTriggers];
                          newTriggers[index] = e.target.value;
                          setEditForm({ ...editForm, escalationTriggers: newTriggers });
                        }}
                        placeholder="Enter escalation trigger"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newTriggers = editForm.escalationTriggers.filter((_, i) => i !== index);
                          setEditForm({ ...editForm, escalationTriggers: newTriggers });
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditForm({ 
                        ...editForm, 
                        escalationTriggers: [...editForm.escalationTriggers, ''] 
                      });
                    }}
                  >
                    Add Trigger
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    updateTemplateMutation.mutate(editForm);
                    setIsEditDialogOpen(false);
                  }}
                  disabled={updateTemplateMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateTemplateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}