import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MessageSquare, Send, Template, Users, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const smsFormSchema = z.object({
  message: z.string().min(1, "Message is required").max(1600, "Message too long (max 1600 characters)"),
  templateId: z.string().optional(),
});

const bulkSmsFormSchema = z.object({
  message: z.string().min(1, "Message is required").max(1600, "Message too long"),
  patientIds: z.array(z.number()).min(1, "Select at least one patient"),
  templateId: z.string().optional(),
});

interface SMSTemplate {
  id: string;
  name: string;
  category: string;
  message: string;
  variables: string[];
  isActive: boolean;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  condition: string;
  riskLevel: string;
}

interface SMSInterfaceProps {
  patient?: Patient;
  patients?: Patient[];
  mode: 'single' | 'bulk';
}

export function SMSInterface({ patient, patients = [], mode }: SMSInterfaceProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPatientIds, setSelectedPatientIds] = useState<number[]>([]);
  const { toast } = useToast();

  const smsForm = useForm<z.infer<typeof smsFormSchema>>({
    resolver: zodResolver(smsFormSchema),
    defaultValues: {
      message: "",
      templateId: "",
    },
  });

  const bulkForm = useForm<z.infer<typeof bulkSmsFormSchema>>({
    resolver: zodResolver(bulkSmsFormSchema),
    defaultValues: {
      message: "",
      patientIds: [],
      templateId: "",
    },
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<SMSTemplate[]>({
    queryKey: ['/api/sms/templates'],
    staleTime: 30000,
  });

  const sendSMSMutation = useMutation({
    mutationFn: async (data: { patientId: number; message: string; templateId?: string }) => {
      return apiRequest('POST', '/api/sms/send', data);
    },
    onSuccess: () => {
      toast({
        title: "SMS Sent",
        description: "Message sent successfully",
      });
      setIsDialogOpen(false);
      smsForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send SMS",
        description: error.details || "Please try again",
        variant: "destructive",
      });
    },
  });

  const sendBulkSMSMutation = useMutation({
    mutationFn: async (data: { patientIds: number[]; message: string; templateId?: string }) => {
      return apiRequest('POST', '/api/sms/send-bulk', data);
    },
    onSuccess: (result: any) => {
      toast({
        title: "Bulk SMS Sent",
        description: `Successfully sent ${result.totalSent} messages, ${result.totalFailed} failed`,
      });
      setIsDialogOpen(false);
      bulkForm.reset();
      setSelectedPatientIds([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Bulk SMS",
        description: error.details || "Please try again",
        variant: "destructive",
      });
    },
  });

  const sendTemplateSMSMutation = useMutation({
    mutationFn: async (data: { patientId: number; templateId: string; variables?: any }) => {
      return apiRequest('POST', '/api/sms/send-template', data);
    },
    onSuccess: () => {
      toast({
        title: "Template SMS Sent",
        description: "Message sent successfully using template",
      });
      setIsDialogOpen(false);
      smsForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Template SMS",
        description: error.details || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSingleSMSSubmit = (data: z.infer<typeof smsFormSchema>) => {
    if (!patient) return;

    if (data.templateId) {
      sendTemplateSMSMutation.mutate({
        patientId: patient.id,
        templateId: data.templateId,
      });
    } else {
      sendSMSMutation.mutate({
        patientId: patient.id,
        message: data.message,
      });
    }
  };

  const onBulkSMSSubmit = (data: z.infer<typeof bulkSmsFormSchema>) => {
    sendBulkSMSMutation.mutate({
      patientIds: selectedPatientIds,
      message: data.message,
      templateId: data.templateId,
    });
  };

  const applyTemplate = (templateId: string, form: any) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      form.setValue('message', template.message);
      form.setValue('templateId', templateId);
    }
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  if (mode === 'single' && patient) {
    return (
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <MessageSquare className="w-4 h-4" />
            Send SMS
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send SMS Message</DialogTitle>
            <DialogDescription>
              Send a text message to {patient.firstName} {patient.lastName} at {formatPhoneNumber(patient.phoneNumber)}
            </DialogDescription>
          </DialogHeader>

          <Form {...smsForm}>
            <form onSubmit={smsForm.handleSubmit(onSingleSMSSubmit)} className="space-y-4">
              {/* Template Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Use Template (Optional)</label>
                <Select onValueChange={(value) => applyTemplate(value, smsForm)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <Template className="w-4 h-4" />
                          <span>{template.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {template.category}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Message Field */}
              <FormField
                control={smsForm.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Type your message here..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <div className="text-xs text-muted-foreground text-right">
                      {field.value?.length || 0}/1600 characters
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={sendSMSMutation.isPending || sendTemplateSMSMutation.isPending}
                  className="gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendSMSMutation.isPending || sendTemplateSMSMutation.isPending ? "Sending..." : "Send SMS"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  // Bulk SMS Mode
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Bulk SMS Messaging
        </CardTitle>
        <CardDescription>
          Send text messages to multiple patients at once
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Send Bulk SMS
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send Bulk SMS</DialogTitle>
              <DialogDescription>
                Select patients and compose a message to send to multiple recipients
              </DialogDescription>
            </DialogHeader>

            <Form {...bulkForm}>
              <form onSubmit={bulkForm.handleSubmit(onBulkSMSSubmit)} className="space-y-4">
                {/* Patient Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Patients</label>
                  <div className="border rounded-lg p-3 max-h-60 overflow-y-auto">
                    {patients.map((p) => (
                      <div key={p.id} className="flex items-center space-x-2 py-2">
                        <input
                          type="checkbox"
                          id={`patient-${p.id}`}
                          checked={selectedPatientIds.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPatientIds([...selectedPatientIds, p.id]);
                            } else {
                              setSelectedPatientIds(selectedPatientIds.filter(id => id !== p.id));
                            }
                          }}
                          className="rounded"
                        />
                        <label htmlFor={`patient-${p.id}`} className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-between">
                            <span>{p.firstName} {p.lastName}</span>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {formatPhoneNumber(p.phoneNumber)}
                              <Badge variant="outline" className="text-xs">
                                {p.riskLevel}
                              </Badge>
                            </div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedPatientIds.length} patients selected
                  </div>
                </div>

                {/* Template Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Use Template (Optional)</label>
                  <Select onValueChange={(value) => applyTemplate(value, bulkForm)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex items-center gap-2">
                            <Template className="w-4 h-4" />
                            <span>{template.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {template.category}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Message Field */}
                <FormField
                  control={bulkForm.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Type your message here..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <div className="text-xs text-muted-foreground text-right">
                        {field.value?.length || 0}/1600 characters
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setSelectedPatientIds([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={sendBulkSMSMutation.isPending || selectedPatientIds.length === 0}
                    className="gap-2"
                  >
                    <Send className="w-4 h-4" />
                    {sendBulkSMSMutation.isPending ? "Sending..." : `Send to ${selectedPatientIds.length} patients`}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}