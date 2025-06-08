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
import { Volume2, Play, Settings, Users, TestTube2, MessageSquare, Edit } from "lucide-react";
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
                          {profile.voice} • {profile.personality.tone}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {profile.personality.pace}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Cardiac Surgery Template */}
              <Card className="border-2 hover:border-blue-200 cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Cardiac Surgery Follow-up</CardTitle>
                    <Badge variant="secondary">Medium</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Post-operative cardiac surgery patients
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Initial Greeting:</div>
                    <div className="text-xs bg-gray-50 p-2 rounded border">
                      "Hello [Patient], this is your healthcare assistant calling for your follow-up after your recent cardiac surgery. How have you been feeling since your visit?"
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="outline" className="text-xs">5 follow-up questions</Badge>
                      <Button variant="ghost" size="sm" className="h-6 px-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Diabetes Management Template */}
              <Card className="border-2 hover:border-green-200 cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Diabetes Management</CardTitle>
                    <Badge variant="secondary">Medium</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Diabetes monitoring and medication adherence
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Initial Greeting:</div>
                    <div className="text-xs bg-gray-50 p-2 rounded border">
                      "Hello [Patient], this is your diabetes care team checking in. How have your blood sugar levels been lately?"
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="outline" className="text-xs">4 follow-up questions</Badge>
                      <Button variant="ghost" size="sm" className="h-6 px-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Urgent Care Template */}
              <Card className="border-2 hover:border-red-200 cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Urgent Follow-up</CardTitle>
                    <Badge variant="destructive">Critical</Badge>
                  </div>
                  <CardDescription className="text-xs">
                    High-priority patient concerns requiring immediate attention
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Initial Greeting:</div>
                    <div className="text-xs bg-gray-50 p-2 rounded border">
                      "Hello [Patient], this is your healthcare team calling urgently. We need to check on you immediately. How are you feeling right now?"
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="outline" className="text-xs">3 escalation triggers</Badge>
                      <Button variant="ghost" size="sm" className="h-6 px-2">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Create New Template Button */}
            <div className="flex justify-center pt-4">
              <Button variant="outline" className="w-full max-w-md">
                <MessageSquare className="h-4 w-4 mr-2" />
                Create New Prompt Template
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
    </div>
  );
}