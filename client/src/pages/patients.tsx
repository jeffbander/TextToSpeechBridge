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
import { insertPatientSchema } from "@shared/schema";
import { z } from "zod";
import { useState } from "react";
import { Plus, Phone, Mail, MapPin, Calendar, User, Heart, AlertTriangle, Bell, Volume2, MessageSquare, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const formSchema = insertPatientSchema.extend({
  dateOfBirth: z.string().min(1, "Date of birth is required").regex(/^\d{4}-\d{2}-\d{2}$/, "Please enter a valid date"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  mrn: z.string().min(1, "Medical Record Number is required"),
  address: z.string().min(1, "Address is required"),
  condition: z.string().min(1, "Medical condition is required"),
  systemId: z.string().optional(), // Make optional for auto-generation
  riskLevel: z.enum(["low", "medium", "high"]),
  email: z.string().optional(),
  alternatePhoneNumber: z.string().optional(),
  customPrompt: z.string().optional(),
  promptMetadata: z.any().optional(),
  importedFrom: z.string().optional(),
  lastDischarge: z.any().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function Patients() {
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [isEditPatientOpen, setIsEditPatientOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [selectedPatientForPrompt, setSelectedPatientForPrompt] = useState<any>(null);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [callType, setCallType] = useState<"initial" | "followUp" | "urgent">("initial");
  const [selectedPatientForSms, setSelectedPatientForSms] = useState<any>(null);
  const [isSmsDialogOpen, setIsSmsDialogOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [patientMessages, setPatientMessages] = useState<any[]>([]);
  const { toast } = useToast();

  const { data: patients = [], isLoading, error: patientsError } = useQuery<any[]>({
    queryKey: ['/api/patients'],
    retry: 3,
    staleTime: 30000,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      mrn: "",
      dateOfBirth: "",
      gender: "Male" as const,
      phoneNumber: "",
      email: "",
      address: "",
      condition: "",
      riskLevel: "low" as const,
      systemId: "",
      alternatePhoneNumber: "",
      customPrompt: "",
    },
  });

  const addPatientMutation = useMutation({
    mutationFn: (data: FormData) => apiRequest('POST', '/api/patients', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      setIsAddPatientOpen(false);
      form.reset();
      toast({
        title: "Patient Added",
        description: "Patient has been successfully added to the system.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add patient",
        variant: "destructive",
      });
    },
  });

  const editPatientMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => 
      apiRequest('PUT', `/api/patients/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      setIsEditPatientOpen(false);
      setEditingPatient(null);
      form.reset();
      toast({
        title: "Patient Updated",
        description: "Patient information has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update patient",
        variant: "destructive",
      });
    },
  });

  const startCallMutation = useMutation({
    mutationFn: (data: { patientId: number; phoneNumber: string }) => 
      apiRequest('POST', '/api/calls/start', data),
    onSuccess: () => {
      toast({
        title: "Call Started",
        description: "Patient call has been initiated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Call Failed",
        description: error.message || "Failed to start call",
        variant: "destructive",
      });
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: (data: { patientId: number; message: string }) => 
      apiRequest('POST', '/api/sms/send', data),
    onSuccess: () => {
      toast({
        title: "SMS Sent",
        description: "Text message sent successfully.",
      });
      setSmsMessage("");
      // Refresh messages for this patient
      if (selectedPatientForSms) {
        fetchPatientMessages(selectedPatientForSms.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "SMS Failed",
        description: error.message || "Failed to send text message",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    if (editingPatient) {
      editPatientMutation.mutate({ id: editingPatient.id, data });
    } else {
      addPatientMutation.mutate(data);
    }
  };

  const startCall = async (patientId: number, phoneNumber: string) => {
    startCallMutation.mutate({ patientId, phoneNumber });
  };

  const fetchPatientMessages = async (patientId: number) => {
    try {
      const response = await fetch(`/api/sms/patient/${patientId}`);
      if (response.ok) {
        const messages = await response.json();
        setPatientMessages(messages);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const openSmsDialog = (patient: any) => {
    setSelectedPatientForSms(patient);
    setSmsMessage("");
    setPatientMessages([]);
    setIsSmsDialogOpen(true);
    // Fetch existing messages for this patient
    fetchPatientMessages(patient.id);
  };

  const sendSms = () => {
    if (!smsMessage.trim() || !selectedPatientForSms) return;
    
    sendSmsMutation.mutate({
      patientId: selectedPatientForSms.id,
      message: smsMessage.trim()
    });
  };

  const openEditDialog = (patient: any) => {
    setEditingPatient(patient);
    form.reset({
      firstName: patient.firstName || "",
      lastName: patient.lastName || "",
      mrn: patient.mrn || "",
      dateOfBirth: patient.dateOfBirth || "",
      gender: patient.gender || "Male",
      phoneNumber: patient.phoneNumber || "",
      email: patient.email || "",
      address: patient.address || "",
      condition: patient.condition || "",
      riskLevel: patient.riskLevel || "low",
      systemId: patient.systemId || "",
      alternatePhoneNumber: patient.alternatePhoneNumber || "",
      customPrompt: patient.customPrompt || "",
    });
    setIsEditPatientOpen(true);
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const getRiskBadgeColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Error handling for failed data fetches
  if (patientsError) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardContent className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Patients</h2>
            <p className="text-muted-foreground mb-4">
              Unable to connect to the patient database. Please check your connection and try again.
            </p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patient Management</h1>
          <p className="text-muted-foreground">
            Manage patient records and contact information
          </p>
        </div>
        
        <Dialog open={isAddPatientOpen} onOpenChange={setIsAddPatientOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Patient
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Patient</DialogTitle>
              <DialogDescription>
                Enter the patient's information to add them to the system.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="First Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Last Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="mrn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MRN *</FormLabel>
                        <FormControl>
                          <Input placeholder="H406522" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="(929) 530-9452" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="patient@example.com" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="440 Berry St Apt 2M, Brooklyn, New York, 11249" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medical Conditions</FormLabel>
                        <FormControl>
                          <Input placeholder="Cardiology Follow-up" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="riskLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Risk Level *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select risk level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="systemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Auto-generated if left empty" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsAddPatientOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={addPatientMutation.isPending}>
                    {addPatientMutation.isPending ? "Adding..." : "Add Patient"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit Patient Dialog */}
        <Dialog open={isEditPatientOpen} onOpenChange={setIsEditPatientOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Patient</DialogTitle>
              <DialogDescription>
                Update patient information in the system.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="First Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Last Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="mrn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MRN *</FormLabel>
                        <FormControl>
                          <Input placeholder="MRN-12345" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 (555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="patient@example.com" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="440 Berry St Apt 2M, Brooklyn, New York, 11249" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medical Conditions</FormLabel>
                        <FormControl>
                          <Input placeholder="Cardiology Follow-up" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="riskLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Risk Level *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select risk level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="systemId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System ID</FormLabel>
                      <FormControl>
                        <Input placeholder="Auto-generated if left empty" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditPatientOpen(false);
                      setEditingPatient(null);
                      form.reset();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editPatientMutation.isPending}>
                    {editPatientMutation.isPending ? "Updating..." : "Update Patient"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Patient List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">Loading patients...</div>
            </CardContent>
          </Card>
        ) : patients.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                No patients found. Add your first patient to get started.
              </div>
            </CardContent>
          </Card>
        ) : (
          patients.map((patient: any) => (
            <Card key={patient.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="bg-blue-100 p-3 rounded-full">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold">
                          {patient.firstName} {patient.lastName}
                        </h3>
                        <Badge className={getRiskBadgeColor(patient.riskLevel)}>
                          {patient.riskLevel?.toUpperCase()} RISK
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        MRN: {patient.mrn} • {patient.condition}
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">Date of Birth</div>
                            <div className="text-sm text-muted-foreground">{patient.dateOfBirth}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">Gender</div>
                            <div className="text-sm text-muted-foreground">{patient.gender}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">Phone</div>
                            <div className="text-sm text-muted-foreground">
                              {formatPhoneNumber(patient.phoneNumber)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">Email</div>
                            <div className="text-sm text-muted-foreground">
                              {patient.email || "Not provided"}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-start space-x-2">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <div className="text-sm font-medium">Address</div>
                            <div className="text-sm text-muted-foreground">{patient.address}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-muted-foreground">
                            System ID: {patient.systemId}
                          </div>
                          <div className="flex space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openEditDialog(patient)}
                            >
                              <User className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => startCall(patient.id, patient.phoneNumber)}
                            >
                              <Heart className="h-4 w-4 mr-1" />
                              Start Call
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedPatientForPrompt(patient);
                                setIsPromptDialogOpen(true);
                              }}
                            >
                              Create Prompt
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => openSmsDialog(patient)}
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Send Text Message
                            </Button>
                            <Button variant="outline" size="sm">
                              View History
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Custom Prompt Dialog */}
      <Dialog open={isPromptDialogOpen} onOpenChange={setIsPromptDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Custom Prompt for {selectedPatientForPrompt?.name}</DialogTitle>
            <DialogDescription>
              Design a personalized message for the AI to deliver during the call. The AI will say the patient's name and your custom message.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="callType">Call Type</Label>
              <Select value={callType} onValueChange={(value: any) => setCallType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">Initial Check-in</SelectItem>
                  <SelectItem value="followUp">Follow-up Call</SelectItem>
                  <SelectItem value="urgent">Urgent Health Check</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="customMessage">Custom Message</Label>
              <Textarea 
                id="customMessage"
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder={`Example: "Hi ${selectedPatientForPrompt?.name}, this is your CardioCare AI assistant calling to check on your recovery after your recent discharge. How are you feeling today?"`}
                rows={4}
                className="mt-2"
              />
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Preview</h4>
              <p className="text-sm text-muted-foreground">
                The AI will say: "{customMessage || `Hi ${selectedPatientForPrompt?.name}, this is your CardioCare AI assistant...`}"
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setIsPromptDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  if (!customMessage.trim()) {
                    toast({
                      title: "Message Required",
                      description: "Please enter a custom message for the AI to deliver.",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    await apiRequest('POST', '/api/calls/start', {
                      patientId: selectedPatientForPrompt.id,
                      phoneNumber: selectedPatientForPrompt.phoneNumber,
                      customPrompt: customMessage,
                      callType: callType
                    });
                    
                    toast({
                      title: "Custom Call Started",
                      description: `Calling ${selectedPatientForPrompt.name} with your personalized message.`,
                    });
                    
                    setIsPromptDialogOpen(false);
                    setCustomMessage("");
                  } catch (error) {
                    toast({
                      title: "Call Failed",
                      description: "Failed to start custom call. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Start Custom Call
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* SMS Dialog */}
      <Dialog open={isSmsDialogOpen} onOpenChange={setIsSmsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Send Text Message to {selectedPatientForSms?.firstName} {selectedPatientForSms?.lastName}</DialogTitle>
            <DialogDescription>
              Send a text message to {formatPhoneNumber(selectedPatientForSms?.phoneNumber || "")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col space-y-4 min-h-0">
            {/* Message History */}
            <div className="flex-1 border rounded-lg p-4 overflow-y-auto bg-muted/30 min-h-[300px]">
              <h4 className="font-medium mb-3 text-sm text-muted-foreground">Message History</h4>
              {patientMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No previous messages</p>
              ) : (
                <div className="space-y-3">
                  {patientMessages.map((msg: any) => (
                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg p-3 ${
                        msg.direction === 'outbound' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-white border'
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                        <p className={`text-xs mt-1 ${
                          msg.direction === 'outbound' 
                            ? 'text-blue-100' 
                            : 'text-muted-foreground'
                        }`}>
                          {msg.direction === 'outbound' ? 'You' : selectedPatientForSms?.firstName} • {' '}
                          {new Date(msg.sentAt || msg.receivedAt).toLocaleString()}
                          {msg.direction === 'outbound' && (
                            <span className="ml-2">
                              {msg.status === 'sent' && '✓'}
                              {msg.status === 'delivered' && '✓✓'}
                              {msg.status === 'undelivered' && '✗ Not delivered'}
                              {msg.status === 'failed' && '✗ Failed'}
                              {msg.status === 'sending' && '⏳'}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Send Message */}
            <div className="space-y-3">
              <Label htmlFor="smsMessage">New Message</Label>
              <div className="flex space-x-2">
                <Textarea 
                  id="smsMessage"
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="Type your message here..."
                  rows={3}
                  className="flex-1"
                />
                <Button 
                  onClick={sendSms}
                  disabled={!smsMessage.trim() || sendSmsMutation.isPending}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {smsMessage.length}/160 characters
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setIsSmsDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}