import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FileText, Plus, Edit, MessageSquare, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const templateFormSchema = z.object({
  id: z.string().min(1, "Template ID is required"),
  name: z.string().min(1, "Template name is required"),
  category: z.enum(["appointment", "medication", "followup", "general"]),
  message: z.string().min(1, "Message is required").max(1600, "Message too long"),
  variables: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

interface SMSTemplate {
  id: string;
  name: string;
  category: string;
  message: string;
  variables: string[];
  isActive: boolean;
}

export default function SMSTemplates() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SMSTemplate | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof templateFormSchema>>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      id: "",
      name: "",
      category: "general",
      message: "",
      variables: [],
      isActive: true,
    },
  });

  const { data: templates = [], isLoading } = useQuery<SMSTemplate[]>({
    queryKey: ['/api/sms/templates'],
    staleTime: 30000,
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof templateFormSchema>) => {
      return apiRequest('POST', '/api/sms/templates', data);
    },
    onSuccess: () => {
      toast({
        title: "Template Created",
        description: "SMS template created successfully",
      });
      setIsDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/sms/templates'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Template",
        description: error.details || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof templateFormSchema>) => {
      return apiRequest('PUT', `/api/sms/templates/${data.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Template Updated",
        description: "SMS template updated successfully",
      });
      setIsDialogOpen(false);
      setEditingTemplate(null);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['/api/sms/templates'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update Template",
        description: error.details || "Please try again",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof templateFormSchema>) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate(data);
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleEditTemplate = (template: SMSTemplate) => {
    setEditingTemplate(template);
    form.reset(template);
    setIsDialogOpen(true);
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    form.reset({
      id: "",
      name: "",
      category: "general",
      message: "",
      variables: [],
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'appointment': return 'bg-blue-100 text-blue-800';
      case 'medication': return 'bg-green-100 text-green-800';
      case 'followup': return 'bg-yellow-100 text-yellow-800';
      case 'general': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const extractVariables = (message: string): string[] => {
    const matches = message.match(/{{\w+}}/g);
    return matches ? matches.map(match => match.slice(2, -2)) : [];
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SMS Templates</h1>
          <p className="text-muted-foreground">
            Manage pre-built message templates for patient communication
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNewTemplate} className="gap-2">
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate 
                  ? 'Update the SMS template details' 
                  : 'Create a new SMS template for patient communication'
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template ID</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., appointment_reminder"
                            {...field}
                            disabled={!!editingTemplate}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Appointment Reminder" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="appointment">Appointment</SelectItem>
                          <SelectItem value="medication">Medication</SelectItem>
                          <SelectItem value="followup">Follow-up</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message Template</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Hi {{firstName}}, this is a reminder..."
                          className="min-h-[120px]"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            const variables = extractVariables(e.target.value);
                            form.setValue('variables', variables);
                          }}
                        />
                      </FormControl>
                      <div className="text-xs text-muted-foreground">
                        Use {{variableName}} for dynamic content (e.g., {{firstName}}, {{doctorName}})
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {field.value?.length || 0}/1600 characters
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch('variables')?.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Detected Variables</label>
                    <div className="flex flex-wrap gap-2">
                      {form.watch('variables').map((variable) => (
                        <Badge key={variable} variant="outline">
                          {variable}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
                  >
                    {createTemplateMutation.isPending || updateTemplateMutation.isPending
                      ? "Saving..."
                      : editingTemplate
                      ? "Update Template"
                      : "Create Template"
                    }
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-8">
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="col-span-full text-center py-8 text-muted-foreground">
            No templates found. Create your first template to get started.
          </div>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                  </div>
                  <Badge className={getCategoryColor(template.category)}>
                    {template.category}
                  </Badge>
                </div>
                <CardDescription className="text-sm">
                  ID: {template.id}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm font-medium text-muted-foreground">Message Preview:</div>
                  <div className="text-sm bg-gray-50 p-3 rounded border-l-4 border-blue-200">
                    {template.message.substring(0, 150)}
                    {template.message.length > 150 && '...'}
                  </div>
                  
                  {template.variables && template.variables.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Variables:</div>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.map((variable) => (
                          <Badge key={variable} variant="outline" className="text-xs">
                            {variable}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3">
                    <Badge variant={template.isActive ? "default" : "secondary"}>
                      {template.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTemplate(template)}
                      className="gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      Edit
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}