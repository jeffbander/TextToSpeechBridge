import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Phone, Clock, CheckCircle, XCircle, RotateCcw, User, Calendar, MapPin } from "lucide-react";
import { Link } from "wouter";

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  alternatePhoneNumber?: string;
  email?: string;
  address: string;
  systemId: string;
  mrn: string;
  dateOfBirth: string;
  gender: string;
  customPrompt?: string;
}

interface CallAttempt {
  id: number;
  campaignId: number;
  patientId: number;
  callId?: number;
  attemptNumber: number;
  status: string;
  phoneNumberUsed: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
  nextRetryAt?: string;
  metadata?: any;
  createdAt: string;
  call?: {
    duration?: number;
    successRating?: string;
    qualityScore?: number;
    informationGathered?: boolean;
    outcome?: string;
  };
}

interface CallAttemptWithPatient extends CallAttempt {
  patient: Patient;
}

interface Campaign {
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

function CallAttemptStatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pending: { variant: "secondary" as const, icon: Clock, label: "Pending", color: "text-gray-600" },
    in_progress: { variant: "default" as const, icon: Phone, label: "In Progress", color: "text-blue-600" },
    completed: { variant: "default" as const, icon: CheckCircle, label: "Completed", color: "text-green-600" },
    failed: { variant: "destructive" as const, icon: XCircle, label: "Failed", color: "text-red-600" },
    scheduled_retry: { variant: "outline" as const, icon: RotateCcw, label: "Retry Scheduled", color: "text-orange-600" },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export default function CampaignDetailsPage() {
  const params = useParams();
  const campaignId = parseInt(params.id as string);

  // Fetch campaign details
  const { data: campaign, isLoading: campaignLoading } = useQuery<Campaign>({
    queryKey: [`/api/campaigns/${campaignId}`],
  });

  // Fetch call attempts with patient data
  const { data: attempts = [], isLoading: attemptsLoading } = useQuery<CallAttemptWithPatient[]>({
    queryKey: [`/api/campaigns/${campaignId}/attempts`],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  if (campaignLoading || attemptsLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-center h-64">
          <Clock className="w-8 h-8 animate-spin mr-3" />
          Loading campaign details...
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Campaign Not Found
          </h1>
          <Link href="/csv-import">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Campaigns
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const completionRate = campaign.totalPatients > 0 
    ? Math.round((campaign.completedCalls / campaign.totalPatients) * 100)
    : 0;

  const successRate = campaign.completedCalls > 0
    ? Math.round((campaign.successfulCalls / campaign.completedCalls) * 100)
    : 0;

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Not scheduled';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/csv-import">
          <Button variant="outline" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campaigns
          </Button>
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {campaign.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {campaign.description || `Created on ${new Date(campaign.createdAt).toLocaleDateString()}`}
            </p>
          </div>
          <CallAttemptStatusBadge status={campaign.status} />
        </div>
      </div>

      {/* Campaign Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {campaign.totalPatients}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Patients</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {completionRate}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Completion Rate</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {successRate}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {campaign.maxRetries}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Max Retries</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex justify-between text-sm mb-2">
            <span>Overall Progress</span>
            <span>{campaign.completedCalls + campaign.failedCalls} / {campaign.totalPatients}</span>
          </div>
          <Progress 
            value={campaign.totalPatients > 0 ? ((campaign.completedCalls + campaign.failedCalls) / campaign.totalPatients) * 100 : 0} 
            className="h-3"
          />
        </CardContent>
      </Card>

      {/* Call Attempts Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Call Attempts Details
          </CardTitle>
          <CardDescription>
            Detailed view of all call attempts for each patient in this campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No call attempts found for this campaign
            </div>
          ) : (
            <div className="space-y-4">
              {attempts.map((attempt) => (
                <div key={attempt.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-500" />
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {attempt.patient.firstName} {attempt.patient.lastName}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          MRN: {attempt.patient.mrn} • System ID: {attempt.patient.systemId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Attempt #{attempt.attemptNumber}</span>
                      <CallAttemptStatusBadge status={attempt.status} />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">Phone:</span>
                        <span>{formatPhoneNumber(attempt.phoneNumberUsed)}</span>
                      </div>
                      {attempt.patient.alternatePhoneNumber && (
                        <div className="flex items-center gap-2 ml-6">
                          <span className="text-gray-500">Alt:</span>
                          <span>{formatPhoneNumber(attempt.patient.alternatePhoneNumber)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">DOB:</span>
                        <span>{attempt.patient.dateOfBirth}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">Scheduled:</span>
                        <span>{formatDateTime(attempt.scheduledAt)}</span>
                      </div>
                      {attempt.startedAt && (
                        <div className="flex items-center gap-2 ml-6">
                          <span className="text-gray-500">Started:</span>
                          <span>{formatDateTime(attempt.startedAt)}</span>
                        </div>
                      )}
                      {attempt.completedAt && (
                        <div className="flex items-center gap-2 ml-6">
                          <span className="text-gray-500">Completed:</span>
                          <span>{formatDateTime(attempt.completedAt)}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      {attempt.failureReason && (
                        <div>
                          <span className="font-medium text-red-600">Failure Reason:</span>
                          <p className="text-red-600 text-xs mt-1">{attempt.failureReason}</p>
                        </div>
                      )}
                      {attempt.nextRetryAt && (
                        <div>
                          <span className="font-medium text-orange-600">Next Retry:</span>
                          <p className="text-orange-600 text-xs mt-1">{formatDateTime(attempt.nextRetryAt)}</p>
                        </div>
                      )}
                      {attempt.patient.customPrompt && (
                        <div>
                          <span className="font-medium text-blue-600">Custom Notes:</span>
                          <p className="text-blue-600 text-xs mt-1 line-clamp-2">{attempt.patient.customPrompt}</p>
                        </div>
                      )}
                      {attempt.call && (
                        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-medium text-green-600">Call Quality:</span>
                          <div className="text-xs mt-1 space-y-1">
                            {attempt.call.duration && (
                              <div>Duration: {attempt.call.duration}s</div>
                            )}
                            {attempt.call.successRating && (
                              <div className="flex items-center gap-2">
                                <span>Success:</span>
                                <Badge variant={
                                  attempt.call.successRating === 'successful' ? 'default' :
                                  attempt.call.successRating === 'partially_successful' ? 'secondary' : 'destructive'
                                }>
                                  {attempt.call.successRating.replace('_', ' ')}
                                </Badge>
                              </div>
                            )}
                            {attempt.call.qualityScore && (
                              <div>Quality Score: {attempt.call.qualityScore}/10</div>
                            )}
                            {attempt.call.informationGathered !== undefined && (
                              <div>Info Gathered: {attempt.call.informationGathered ? 'Yes' : 'No'}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}