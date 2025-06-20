import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Play, Pause, BarChart3, CheckCircle, XCircle, Clock, Users, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  campaignId?: number;
}

interface CallCampaign {
  id: number;
  name: string;
  description: string;
  status: string;
  totalPatients: number;
  completedCalls: number;
  successfulCalls: number;
  failedCalls: number;
  maxRetries: number;
  retryIntervalHours: number;
  createdAt: string;
  completedAt?: string;
}

interface CampaignStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  scheduled_retry: number;
}

function CampaignStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    active: { variant: "default" as const, icon: Play, label: "Active" },
    paused: { variant: "secondary" as const, icon: Pause, label: "Paused" },
    completed: { variant: "outline" as const, icon: CheckCircle, label: "Completed" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.paused;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export default function CsvImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Download CSV template function
  const downloadCSVTemplate = () => {
    const sampleData = [
      {
        "System ID": "Smith_John__01/15/1980",
        "MRN": "MRN001234",
        "DOB": "01/15/1980",
        "Patient Name": "Smith, John",
        "Gender": "Male",
        "Phone_Number": "555-123-4567",
        "Alternate_Phone_Number": "555-987-6543",
        "Patient_Address": "123 Main St, Anytown, NY 12345",
        "Primary Email": "john.smith@email.com",
        "Master Note": "Post-cardiac surgery follow-up. Patient prefers English communication. Check medication compliance and any chest pain symptoms."
      },
      {
        "System ID": "Johnson_Mary__03/22/1975",
        "MRN": "MRN005678",
        "DOB": "03/22/1975",
        "Patient Name": "Johnson, Mary",
        "Gender": "Female",
        "Phone_Number": "555-234-5678",
        "Alternate_Phone_Number": "",
        "Patient_Address": "456 Oak Ave, Springfield, NY 54321",
        "Primary Email": "mary.johnson@email.com",
        "Master Note": "CHF follow-up. Patient speaks Spanish as primary language. Monitor weight gain and breathing difficulties."
      },
      {
        "System ID": "Cohen_David__12/08/1965",
        "MRN": "MRN009876",
        "DOB": "12/08/1965",
        "Patient Name": "Cohen, David",
        "Gender": "Male",
        "Phone_Number": "555-345-6789",
        "Alternate_Phone_Number": "555-876-5432",
        "Patient_Address": "789 Pine Rd, Brooklyn, NY 67890",
        "Primary Email": "",
        "Master Note": "Diabetes and cardiac care. Patient prefers Yiddish communication. Check blood sugar levels and medication adherence."
      }
    ];

    // Convert to CSV format
    const headers = Object.keys(sampleData[0]);
    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => 
        headers.map(header => {
          const value = row[header as keyof typeof row] || '';
          // Wrap in quotes if contains comma or is empty
          return value.includes(',') || value === '' ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'patient-import-template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Template Downloaded",
      description: "CSV template saved as patient-import-template.csv",
    });
  };

  // Fetch call campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<CallCampaign[]>({
    queryKey: ["/api/campaigns"],
  });

  // Upload CSV mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, name }: { file: File; name: string }) => {
      console.log('Starting upload mutation', { fileName: file.name, fileSize: file.size, campaignName: name });
      
      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('campaignName', name);

      const response = await fetch('/api/csv/import', {
        method: 'POST',
        body: formData,
      });

      console.log('Upload response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed:', errorText);
        throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);
      return result;
    },
    onSuccess: (result: ImportResult) => {
      setImportResult(result);
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      
      if (result.success) {
        toast({
          title: "CSV Import Successful",
          description: `Imported ${result.imported} patients. Campaign created.`,
        });
      } else {
        toast({
          title: "Import Issues",
          description: `Import completed with ${result.errors.length} errors.`,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Campaign control mutations
  const startCampaignMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      const response = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to start campaign');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign Started",
        description: "Call campaign has been activated and calls are being scheduled.",
      });
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      const response = await fetch(`/api/campaigns/${campaignId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to pause campaign');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign Paused",
        description: "Call campaign has been paused.",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setSelectedFile(file);
      setImportResult(null);
    } else {
      toast({
        title: "Invalid File",
        description: "Please select a valid CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleUpload = () => {
    console.log('Upload button clicked', { selectedFile: !!selectedFile, campaignName, isUploading });
    
    if (!selectedFile || !campaignName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a CSV file and enter a campaign name.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    uploadMutation.mutate({ file: selectedFile, name: campaignName.trim() });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          CSV Patient Import & Call Campaigns
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Import patient data from CSV files and manage automated calling campaigns
        </p>
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import CSV
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Manage Campaigns
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Upload Patient CSV File
              </CardTitle>
              <CardDescription>
                Import patients from CSV and create an automated calling campaign with 3 retry attempts per patient
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  placeholder="Enter campaign name (e.g., 'June 2025 Follow-ups')"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                />
                {selectedFile && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">CSV Format Requirements:</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadCSVTemplate}
                    className="flex items-center gap-2 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-600"
                  >
                    <Download className="w-4 h-4" />
                    Download Template
                  </Button>
                </div>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• <strong>System ID</strong> (unique identifier): LastName_FirstName__MM/DD/YYYY format</li>
                  <li>• <strong>Required:</strong> MRN, DOB, Patient Name, Gender, Phone_Number</li>
                  <li>• <strong>Optional:</strong> Alternate_Phone_Number, Patient_Address, Primary Email</li>
                  <li>• <strong>Master Note:</strong> Custom instructions for GPT-4o conversation prompts</li>
                  <li>• <strong>Business Hours:</strong> Calls scheduled 9 AM - 8 PM Eastern, weekdays only</li>
                </ul>
              </div>

              <Button 
                onClick={handleUpload}
                disabled={!selectedFile || !campaignName.trim() || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import CSV & Create Campaign
                  </>
                )}
              </Button>

              {importResult && (
                <Alert className={importResult.success ? "border-green-500" : "border-red-500"}>
                  <AlertDescription>
                    {importResult.success ? (
                      <div className="space-y-2">
                        <p className="font-semibold text-green-700 dark:text-green-300">
                          ✓ Successfully imported {importResult.imported} patients
                        </p>
                        {importResult.campaignId && (
                          <p className="text-sm">Campaign ID: {importResult.campaignId}</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-semibold text-red-700 dark:text-red-300">
                          Import completed with issues
                        </p>
                        {importResult.errors.slice(0, 5).map((error, idx) => (
                          <p key={idx} className="text-sm text-red-600 dark:text-red-400">• {error}</p>
                        ))}
                        {importResult.errors.length > 5 && (
                          <p className="text-sm text-red-600 dark:text-red-400">
                            ... and {importResult.errors.length - 5} more errors
                          </p>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="grid gap-6">
            {campaignsLoading ? (
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-center">
                    <Clock className="w-6 h-6 animate-spin mr-2" />
                    Loading campaigns...
                  </div>
                </CardContent>
              </Card>
            ) : campaigns.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold mb-2">No Campaigns Yet</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Import a CSV file to create your first call campaign
                  </p>
                </CardContent>
              </Card>
            ) : (
              campaigns.map((campaign) => (
                <CampaignCard 
                  key={campaign.id} 
                  campaign={campaign}
                  onStart={() => startCampaignMutation.mutate(campaign.id)}
                  onPause={() => pauseCampaignMutation.mutate(campaign.id)}
                  isStarting={startCampaignMutation.isPending}
                  isPausing={pauseCampaignMutation.isPending}
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CampaignCard({ 
  campaign, 
  onStart, 
  onPause, 
  isStarting, 
  isPausing 
}: { 
  campaign: CallCampaign;
  onStart: () => void;
  onPause: () => void;
  isStarting: boolean;
  isPausing: boolean;
}) {
  const { data: stats } = useQuery<CampaignStats>({
    queryKey: [`/api/campaigns/${campaign.id}/stats`],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const completionRate = campaign.totalPatients > 0 
    ? Math.round((campaign.completedCalls / campaign.totalPatients) * 100)
    : 0;

  const successRate = campaign.completedCalls > 0
    ? Math.round((campaign.successfulCalls / campaign.completedCalls) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {campaign.name}
              <CampaignStatusBadge status={campaign.status} />
            </CardTitle>
            <CardDescription className="mt-1">
              {campaign.description || `Created on ${new Date(campaign.createdAt).toLocaleDateString()}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {campaign.status === 'active' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onPause}
                disabled={isPausing}
              >
                <Pause className="w-4 h-4 mr-1" />
                Pause
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={onStart}
                disabled={isStarting || campaign.status === 'completed'}
              >
                <Play className="w-4 h-4 mr-1" />
                Start
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {campaign.totalPatients}
            </div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Total Patients</div>
          </div>
          <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {completionRate}%
            </div>
            <div className="text-sm text-green-600 dark:text-green-400">Completion Rate</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {successRate}%
            </div>
            <div className="text-sm text-purple-600 dark:text-purple-400">Success Rate</div>
          </div>
        </div>

        {stats && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{stats.completed + stats.failed} / {stats.total}</span>
            </div>
            <Progress 
              value={stats.total > 0 ? ((stats.completed + stats.failed) / stats.total) * 100 : 0} 
              className="h-2"
            />
            <div className="grid grid-cols-5 gap-2 text-xs">
              <div className="text-center">
                <div className="font-semibold text-gray-600">{stats.pending}</div>
                <div className="text-gray-500">Pending</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">{stats.in_progress}</div>
                <div className="text-gray-500">In Progress</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-green-600">{stats.completed}</div>
                <div className="text-gray-500">Completed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-red-600">{stats.failed}</div>
                <div className="text-gray-500">Failed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-orange-600">{stats.scheduled_retry}</div>
                <div className="text-gray-500">Retrying</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}