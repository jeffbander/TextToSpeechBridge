import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Phone, Clock, CheckCircle, AlertCircle, Users, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CSVImportResult {
  totalRows: number;
  processedRows: number;
  newPatients: number;
  existingPatients: number;
  worklistItems: number;
  errors: Array<{ row: number; error: string }>;
}

interface WorklistItem {
  id: number;
  systemId: string;
  patientName: string;
  patientPhone: string;
  patientCondition: string;
  dateOfService: string;
  timeOfService: string;
  customPrompt: string;
  status: string;
  priority: string;
  attemptCount: number;
  lastAttempt?: string;
  scheduledFor?: string;
  notes?: string;
  createdAt: string;
}

export default function CSVImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch call worklist
  const { data: worklist = [], isLoading: worklistLoading } = useQuery<WorklistItem[]>({
    queryKey: ["/api/csv/worklist"],
  });

  // Fetch pending worklist items
  const { data: pendingItems = [], isLoading: pendingLoading } = useQuery<WorklistItem[]>({
    queryKey: ["/api/csv/worklist/pending"],
  });

  // CSV import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      
      const response = await fetch('/api/csv/import-patients', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setImportResult(data.result);
      queryClient.invalidateQueries({ queryKey: ["/api/csv/worklist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/csv/worklist/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Import Successful",
        description: `Processed ${data.result.processedRows} rows, created ${data.result.newPatients} patients and ${data.result.worklistItems} worklist items.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Execute worklist item mutation
  const executeMutation = useMutation({
    mutationFn: async (worklistId: number) => {
      const response = await fetch(`/api/csv/worklist/${worklistId}/execute`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Execution failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/csv/worklist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/csv/worklist/pending"] });
      toast({
        title: "Call Initiated",
        description: `Call started from worklist item.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update worklist item mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      const response = await fetch(`/api/csv/worklist/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Update failed');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/csv/worklist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/csv/worklist/pending"] });
      toast({
        title: "Item Updated",
        description: "Worklist item updated successfully.",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
      setImportResult(null);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleImport = () => {
    if (!selectedFile) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to import.",
        variant: "destructive",
      });
      return;
    }
    
    importMutation.mutate(selectedFile);
  };

  const handleExecuteCall = (worklistId: number) => {
    executeMutation.mutate(worklistId);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "secondary",
      scheduled: "default",
      completed: "outline",
      failed: "destructive",
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"}>
        {status}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants = {
      urgent: "destructive",
      high: "default",
      normal: "secondary",
      low: "outline",
    } as const;
    
    return (
      <Badge variant={variants[priority as keyof typeof variants] || "secondary"}>
        {priority}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">CSV Import & Call Worklist</h1>
        <p className="text-muted-foreground mt-2">
          Import patient data and manage automated call schedules from external systems
        </p>
      </div>

      <Tabs defaultValue="import" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="import">CSV Import</TabsTrigger>
          <TabsTrigger value="worklist">Call Worklist</TabsTrigger>
          <TabsTrigger value="pending">Pending Calls</TabsTrigger>
        </TabsList>

        {/* CSV Import Tab */}
        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Patient CSV
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="csvFile">CSV File</Label>
                <Input
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={importMutation.isPending}
                />
                <p className="text-sm text-muted-foreground">
                  Expected columns: System ID, First Name, Last Name, DOB, MRN, Phone, Date of Service, Time of Service, Prompt
                </p>
              </div>

              {selectedFile && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-sm text-muted-foreground">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                </div>
              )}

              <Button 
                onClick={handleImport} 
                disabled={!selectedFile || importMutation.isPending}
                className="w-full"
              >
                {importMutation.isPending ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV
                  </>
                )}
              </Button>

              {/* Import Results */}
              {importResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Import Results</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{importResult.totalRows}</div>
                        <div className="text-sm text-muted-foreground">Total Rows</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{importResult.processedRows}</div>
                        <div className="text-sm text-muted-foreground">Processed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{importResult.newPatients}</div>
                        <div className="text-sm text-muted-foreground">New Patients</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{importResult.worklistItems}</div>
                        <div className="text-sm text-muted-foreground">Worklist Items</div>
                      </div>
                    </div>

                    {importResult.processedRows > 0 && (
                      <Progress value={(importResult.processedRows / importResult.totalRows) * 100} className="w-full" />
                    )}

                    {importResult.errors.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-destructive">Errors ({importResult.errors.length})</h4>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {importResult.errors.map((error, index) => (
                            <div key={index} className="text-sm p-2 bg-destructive/10 rounded">
                              Row {error.row}: {error.error}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* CSV Format Guide */}
          <Card>
            <CardHeader>
              <CardTitle>CSV Format Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Your CSV file should include the following columns (order doesn't matter):
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Required Columns:</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• System ID (unique identifier)</li>
                      <li>• First Name</li>
                      <li>• Last Name</li>
                      <li>• Date of Birth (MM/DD/YYYY)</li>
                      <li>• MRN (Medical Record Number)</li>
                      <li>• Phone Number</li>
                      <li>• Date of Service</li>
                      <li>• Time of Service (HH:MM)</li>
                      <li>• Prompt (call instructions)</li>
                    </ul>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Optional Columns:</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Email</li>
                      <li>• Gender</li>
                      <li>• Address</li>
                      <li>• Condition</li>
                      <li>• Priority (urgent, high, normal, low)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Call Worklist Tab */}
        <TabsContent value="worklist" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Call Worklist ({worklist.length} items)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {worklistLoading ? (
                <div className="text-center py-8">Loading worklist...</div>
              ) : worklist.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No worklist items found. Import a CSV file to create call schedules.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patient</TableHead>
                        <TableHead>System ID</TableHead>
                        <TableHead>Service Date</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {worklist.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.patientName}</div>
                              <div className="text-sm text-muted-foreground">{item.patientPhone}</div>
                              <div className="text-xs text-muted-foreground">{item.patientCondition}</div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.systemId}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{new Date(item.dateOfService).toLocaleDateString()}</div>
                              <div className="text-muted-foreground">{item.timeOfService}</div>
                            </div>
                          </TableCell>
                          <TableCell>{getPriorityBadge(item.priority)}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{item.attemptCount || 0}</div>
                              {item.lastAttempt && (
                                <div className="text-xs text-muted-foreground">
                                  {formatDateTime(item.lastAttempt)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {item.status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleExecuteCall(item.id)}
                                  disabled={executeMutation.isPending}
                                >
                                  <Phone className="h-3 w-3 mr-1" />
                                  Call
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Calls Tab */}
        <TabsContent value="pending" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Pending Calls ({pendingItems.length} items)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="text-center py-8">Loading pending calls...</div>
              ) : pendingItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending calls found.
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingItems.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="pt-6">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{item.patientName}</h3>
                              {getPriorityBadge(item.priority)}
                              {getStatusBadge(item.status)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <div>System ID: {item.systemId}</div>
                              <div>Phone: {item.patientPhone}</div>
                              <div>Service: {formatDateTime(item.dateOfService)} at {item.timeOfService}</div>
                            </div>
                            <div className="text-sm">
                              <div className="font-medium">Call Instructions:</div>
                              <div className="text-muted-foreground bg-muted p-2 rounded text-xs max-w-md">
                                {item.customPrompt.length > 200 
                                  ? `${item.customPrompt.substring(0, 200)}...` 
                                  : item.customPrompt
                                }
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleExecuteCall(item.id)}
                              disabled={executeMutation.isPending}
                            >
                              <Phone className="h-3 w-3 mr-1" />
                              Execute Call
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}