import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, FileText, Phone, Plus, User } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  condition: string;
  mrn: string;
}

interface PatientDocument {
  id: number;
  patientId: number;
  title: string;
  content: string;
  documentType: string;
  priority: number;
  isActive: boolean;
}

export default function HumeIntegration() {
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [newDocument, setNewDocument] = useState({
    title: '',
    content: '',
    documentType: 'care_instructions',
    priority: 1
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch patients
  const { data: patients = [], isLoading: patientsLoading } = useQuery({
    queryKey: ['/api/patients'],
  });

  // Fetch patient documents for selected patient
  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: [`/api/hume/patient-documents/${selectedPatientId}`],
    enabled: !!selectedPatientId,
  });

  // Start Hume AI call mutation
  const startCallMutation = useMutation({
    mutationFn: async (patientId: number) => {
      const response = await fetch('/api/hume/start-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId })
      });
      if (!response.ok) throw new Error('Failed to start call');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Call Started",
        description: `Hume AI call initiated successfully. Call ID: ${data.callId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    },
    onError: (error: any) => {
      toast({
        title: "Call Failed",
        description: error.message || "Failed to start Hume AI call",
        variant: "destructive",
      });
    }
  });

  // Add document mutation
  const addDocumentMutation = useMutation({
    mutationFn: async (document: any) => {
      const response = await fetch('/api/hume/patient-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...document, patientId: selectedPatientId })
      });
      if (!response.ok) throw new Error('Failed to add document');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Added",
        description: "Patient document added successfully",
      });
      setNewDocument({ title: '', content: '', documentType: 'care_instructions', priority: 1 });
      queryClient.invalidateQueries({ queryKey: [`/api/hume/patient-documents/${selectedPatientId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Document",
        description: error.message || "Failed to add patient document",
        variant: "destructive",
      });
    }
  });

  const selectedPatient = patients.find((p: Patient) => p.id === selectedPatientId);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Phone className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Hume AI Integration</h1>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          This system uses Hume AI's EVI (Empathic Voice Interface) for natural voice conversations. 
          Each patient has personalized documents that Hume AI can read during calls to ensure accurate, 
          patient-specific information delivery.
        </AlertDescription>
      </Alert>

      {/* Patient Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Select Patient</span>
          </CardTitle>
          <CardDescription>
            Choose a patient to view their documents and start a Hume AI call
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {patientsLoading ? (
                <div>Loading patients...</div>
              ) : (
                patients.map((patient: Patient) => (
                  <Card 
                    key={patient.id} 
                    className={`cursor-pointer transition-colors ${
                      selectedPatientId === patient.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedPatientId(patient.id)}
                  >
                    <CardContent className="p-4">
                      <h3 className="font-semibold">{patient.firstName} {patient.lastName}</h3>
                      <p className="text-sm text-gray-600">MRN: {patient.mrn}</p>
                      <p className="text-sm text-gray-600">Condition: {patient.condition}</p>
                      <p className="text-sm text-gray-600">Phone: {patient.phoneNumber}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedPatient && (
        <>
          {/* Patient Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Patient Documents - {selectedPatient.firstName} {selectedPatient.lastName}</span>
              </CardTitle>
              <CardDescription>
                Documents that Hume AI will reference during calls. These contain patient-specific information 
                to ensure accurate and personalized conversations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documentsLoading ? (
                  <div>Loading documents...</div>
                ) : documents.length === 0 ? (
                  <p className="text-gray-500">No documents found for this patient. Add some below.</p>
                ) : (
                  documents.map((doc: PatientDocument) => (
                    <Card key={doc.id} className="border-l-4 border-l-blue-500">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold">{doc.title}</h4>
                          <div className="flex space-x-2">
                            <Badge variant="secondary">{doc.documentType}</Badge>
                            <Badge variant="outline">Priority {doc.priority}</Badge>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.content}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Add New Document */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>Add Patient Document</span>
              </CardTitle>
              <CardDescription>
                Add specific documents or notes that Hume AI should reference when calling this patient
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Document Title</Label>
                    <Input
                      id="title"
                      value={newDocument.title}
                      onChange={(e) => setNewDocument({ ...newDocument, title: e.target.value })}
                      placeholder="e.g., Discharge Instructions, Medication List"
                    />
                  </div>
                  <div>
                    <Label htmlFor="documentType">Document Type</Label>
                    <Select
                      value={newDocument.documentType}
                      onValueChange={(value) => setNewDocument({ ...newDocument, documentType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discharge_summary">Discharge Summary</SelectItem>
                        <SelectItem value="medication_list">Medication List</SelectItem>
                        <SelectItem value="care_instructions">Care Instructions</SelectItem>
                        <SelectItem value="lab_results">Lab Results</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="priority">Priority (1-5)</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="1"
                    max="5"
                    value={newDocument.priority}
                    onChange={(e) => setNewDocument({ ...newDocument, priority: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={newDocument.content}
                    onChange={(e) => setNewDocument({ ...newDocument, content: e.target.value })}
                    placeholder="Enter the content that Hume AI should read to this patient..."
                    rows={6}
                  />
                </div>
                <Button 
                  onClick={() => addDocumentMutation.mutate(newDocument)}
                  disabled={!newDocument.title || !newDocument.content || addDocumentMutation.isPending}
                >
                  {addDocumentMutation.isPending ? 'Adding...' : 'Add Document'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Start Call */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Phone className="h-5 w-5" />
                <span>Start Hume AI Call</span>
              </CardTitle>
              <CardDescription>
                Initiate a call using Hume AI's conversational voice interface. The AI will use the patient's 
                documents above to provide personalized care information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Call Process:</strong> Hume AI will call {selectedPatient.firstName} at {selectedPatient.phoneNumber}, 
                    verify their identity, and discuss their {selectedPatient.condition} care using their specific documents.
                  </AlertDescription>
                </Alert>
                <Button 
                  onClick={() => startCallMutation.mutate(selectedPatient.id)}
                  disabled={startCallMutation.isPending}
                  size="lg"
                  className="w-full"
                >
                  {startCallMutation.isPending ? 'Starting Call...' : `Call ${selectedPatient.firstName} with Hume AI`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}