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
import { Plus, Phone, Mail, MapPin, Calendar, User, Heart, AlertTriangle, Bell, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const formSchema = insertPatientSchema.extend({
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  gender: z.enum(["Male", "Female", "Other"]),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
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
      phoneNumber: "",
      email: "",
      dateOfBirth: "",
      mrn: "",
      gender: "Female",
      address: "",
      systemId: "",
      condition: "",
      riskLevel: "low",
    },
  });

  const addPatientMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("POST", "/api/patients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients'] });
      setIsAddPatientOpen(false);
      form.reset();
      toast({
        title: "Patient Added",
        description: "New patient has been successfully added to the system.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add patient. Please try again.",
        variant: "destructive",
      });
    },
  });

  const editPatientMutation = useMutation({
    mutationFn: async (data: FormData & { id: number }) => {
      return apiRequest("PUT", `/api/patients/${data.id}`, data);
    },
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update patient. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    // Generate system ID using firstName/lastName and dateOfBirth
    if (!data.systemId) {
      const dobFormatted = data.dateOfBirth.replace(/-/g, "/");
      data.systemId = `${data.lastName}_${data.firstName}__${dobFormatted}`;
    }
    
    if (editingPatient) {
      editPatientMutation.mutate({ ...data, id: editingPatient.id });
    } else {
      addPatientMutation.mutate(data);
    }
  };

  const openEditDialog = (patient: any) => {
    setEditingPatient(patient);
    form.reset({
      firstName: patient.firstName || "",
      lastName: patient.lastName || "",
      phoneNumber: patient.phoneNumber || "",
      email: patient.email || "",
      dateOfBirth: patient.dateOfBirth || "",
      mrn: patient.mrn || "",
      gender: patient.gender || "Female",
      address: patient.address || "",
      systemId: patient.systemId || "",
      condition: patient.condition || "",
      riskLevel: patient.riskLevel || "low",
    });
    setIsEditPatientOpen(true);
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const startCall = async (patientId: number, phoneNumber: string) => {
    try {
      const response = await apiRequest('POST', '/api/calls/start', { 
        patientId, 
        phoneNumber 
      });
      toast({
        title: "Call Started",
        description: `Initiating call to ${phoneNumber}`,
      });
    } catch (error) {
      toast({
        title: "Call Failed",
        description: "Failed to start call. Please try again.",
        variant: "destructive",
      });
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
                          <Input placeholder="3/20/1986" {...field} />
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                <div className="grid grid-cols-2 gap-4">
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
                      <FormLabel>Address *</FormLabel>
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
                        <FormLabel>Condition *</FormLabel>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                Update the patient's information.
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
                          <Input 
                            type="date" 
                            {...field} 
                            value={field.value || ""} 
                          />
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
                      <FormLabel>Address *</FormLabel>
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
                        <FormLabel>Condition *</FormLabel>
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
          patients.map((patient) => (
            <Card key={patient.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{patient.firstName} {patient.lastName}</CardTitle>
                      <CardDescription>MRN: {patient.mrn}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={getRiskLevelColor(patient.riskLevel)}>
                      {patient.riskLevel} risk
                    </Badge>
                    <Badge variant="outline">{patient.condition}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <Button variant="outline" size="sm">
                        View History
                      </Button>
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
    </div>
  );
}