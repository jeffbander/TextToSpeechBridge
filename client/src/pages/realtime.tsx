import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AudioRealtime from '@/components/realtime/audio-realtime';
import { Bot, Phone, User } from 'lucide-react';

interface Patient {
  id: number;
  name: string;
  phoneNumber: string;
  condition: string;
}

export default function RealtimePage() {
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionCallId, setSessionCallId] = useState<number | null>(null);

  const { data: patients = [], isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ['/api/patients'],
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  const startRealtimeSession = async () => {
    if (!selectedPatient) return;

    try {
      // Create a real-time session without Twilio call
      const sessionId = `demo_${Date.now()}`;
      setSessionCallId(parseInt(sessionId.replace('demo_', '')));
      setIsSessionActive(true);
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  const endRealtimeSession = () => {
    setIsSessionActive(false);
    setSessionCallId(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">GPT-4o Real-time Preview</h1>
          <p className="text-muted-foreground">
            Advanced real-time voice conversation with GPT-4o for healthcare interactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Bot className="h-8 w-8 text-blue-600" />
          <span className="text-sm font-medium">AI-Powered</span>
        </div>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Phone className="h-5 w-5 text-green-600" />
              <span className="font-medium">Real-time Voice</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Live voice conversation with natural speech patterns and instant responses
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <span className="font-medium">GPT-4o Intelligence</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Advanced AI understanding with healthcare-specific knowledge and empathy
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-purple-600" />
              <span className="font-medium">Patient-Focused</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Personalized conversations adapted to individual patient needs and conditions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Session Management */}
      {!isSessionActive ? (
        <Card>
          <CardHeader>
            <CardTitle>AI Voice Call</CardTitle>
            <p className="text-sm text-muted-foreground">
              Select a patient and start an AI call. The AI will speak immediately and listen for responses.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Patient</label>
              <Select
                value={selectedPatientId?.toString() || ""}
                onValueChange={(value) => setSelectedPatientId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a patient for the session" />
                </SelectTrigger>
                <SelectContent>
                  {patientsLoading ? (
                    <SelectItem value="loading">Loading patients...</SelectItem>
                  ) : (
                    patients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id.toString()}>
                        {patient.name} - {patient.condition}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedPatient && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900">Ready to Call</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>Patient: {selectedPatient.name}</p>
                  <p>Condition: {selectedPatient.condition}</p>
                  <p className="text-xs mt-2 font-medium">Click below to start the AI voice call</p>
                </div>
              </div>
            )}

            <Button 
              onClick={startRealtimeSession}
              disabled={!selectedPatient}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Phone className="mr-2 h-4 w-4" />
              Call Patient with AI
            </Button>
          </CardContent>
        </Card>
      ) : (
        selectedPatient && sessionCallId && (
          <AudioRealtime
            key={`session-${selectedPatient.id}-${sessionCallId}`}
            patientId={selectedPatient.id}
            patientName={selectedPatient.name}
            callId={sessionCallId}
            onEnd={endRealtimeSession}
          />
        )
      )}

      {/* Technical Information */}
      <Card>
        <CardHeader>
          <CardTitle>Technical Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Real-time Features</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Live audio streaming with WebSocket connections</li>
                <li>• Real-time speech recognition and synthesis</li>
                <li>• Dynamic conversation flow with context awareness</li>
                <li>• Automatic transcription and session recording</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-2">Healthcare Optimization</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Patient-specific conversation personalization</li>
                <li>• Medical terminology and empathy integration</li>
                <li>• Symptom analysis and concern escalation</li>
                <li>• Post-discharge follow-up protocols</li>
              </ul>
            </div>
          </div>
          
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              This feature uses OpenAI's GPT-4o real-time preview API for advanced voice interactions.
              Ensure your OpenAI API key has access to the real-time preview features.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}