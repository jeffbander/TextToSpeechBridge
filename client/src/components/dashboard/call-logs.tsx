import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayCircle, Phone, MessageSquare, Clock, User } from "lucide-react";
import { useState } from "react";

interface CallLogsProps {
  calls: any[];
  isLoading: boolean;
}

export default function CallLogs({ calls, isLoading }: CallLogsProps) {
  const [expandedCall, setExpandedCall] = useState<number | null>(null);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTranscript = (transcript: string) => {
    try {
      return JSON.parse(transcript);
    } catch {
      return [];
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getAlertLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call Logs</CardTitle>
          <CardDescription>Loading call history...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Call Logs & Transcripts
        </CardTitle>
        <CardDescription>
          Detailed conversation logs with full transcripts, AI analysis, and voice recordings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No calls available. Start a new call to see logs here.
            </p>
          ) : (
            calls.map((call) => {
              const transcript = parseTranscript(call.transcript || "[]");
              const isExpanded = expandedCall === call.id;
              
              return (
                <div key={call.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(call.status)}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="font-medium">{call.patientName}</span>
                          <Badge variant="outline" className="text-xs">
                            {call.condition}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {call.phoneNumber}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(call.duration)}
                          </span>
                          {call.startedAt && (
                            <span>
                              {new Date(call.startedAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {call.alertLevel && call.alertLevel !== 'none' && (
                        <Badge variant={getAlertLevelColor(call.alertLevel)}>
                          {call.alertLevel}
                        </Badge>
                      )}
                      <Badge variant={call.status === 'active' ? 'default' : 'secondary'}>
                        {call.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedCall(isExpanded ? null : call.id)}
                      >
                        {isExpanded ? 'Hide Details' : 'View Details'}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-4 pt-3 border-t">
                      {/* Conversation Transcript */}
                      {transcript.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Full Conversation Transcript</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto bg-muted p-3 rounded">
                            {transcript.map((entry: any, index: number) => (
                              <div key={`${call.id}-transcript-${index}`} className="flex gap-3">
                                <div className="flex-shrink-0">
                                  {entry.speaker === 'ai' ? (
                                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                      <span className="text-xs text-white font-bold">AI</span>
                                    </div>
                                  ) : (
                                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                      <User className="h-3 w-3 text-white" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="text-sm">
                                    <span className="font-medium">
                                      {entry.speaker === 'ai' ? 'CardioCare AI' : 'Patient'}:
                                    </span>
                                    <span className="ml-2">{entry.text}</span>
                                  </div>
                                  {entry.timestamp && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {new Date(entry.timestamp).toLocaleTimeString()}
                                    </div>
                                  )}
                                  {entry.recordingUrl && (
                                    <a 
                                      href={entry.recordingUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                                    >
                                      <PlayCircle className="h-3 w-3" />
                                      Play Recording
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Analysis */}
                      {call.aiAnalysis && (
                        <div>
                          <h4 className="font-medium mb-2">AI Health Analysis</h4>
                          <div className="bg-muted p-3 rounded space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <span className="text-sm font-medium">Urgency Level:</span>
                                <Badge variant={getAlertLevelColor(call.aiAnalysis.urgencyLevel)} className="ml-2">
                                  {call.aiAnalysis.urgencyLevel}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-sm font-medium">Follow-up Required:</span>
                                <Badge variant={call.aiAnalysis.followUpRequired ? 'default' : 'secondary'} className="ml-2">
                                  {call.aiAnalysis.followUpRequired ? 'Yes' : 'No'}
                                </Badge>
                              </div>
                            </div>
                            
                            {call.aiAnalysis.symptoms && call.aiAnalysis.symptoms.length > 0 && (
                              <div>
                                <span className="text-sm font-medium">Reported Symptoms:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {call.aiAnalysis.symptoms.map((symptom: string, idx: number) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {symptom}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {call.aiAnalysis.concerns && call.aiAnalysis.concerns.length > 0 && (
                              <div>
                                <span className="text-sm font-medium">Patient Concerns:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {call.aiAnalysis.concerns.map((concern: string, idx: number) => (
                                    <Badge key={idx} variant="destructive" className="text-xs">
                                      {concern}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {call.aiAnalysis.summary && (
                              <div>
                                <span className="text-sm font-medium">Summary:</span>
                                <p className="text-sm mt-1 bg-background p-2 rounded border">{call.aiAnalysis.summary}</p>
                              </div>
                            )}

                            {call.aiAnalysis.nextQuestions && call.aiAnalysis.nextQuestions.length > 0 && (
                              <div>
                                <span className="text-sm font-medium">Suggested Follow-up Questions:</span>
                                <ul className="text-sm mt-1 space-y-1">
                                  {call.aiAnalysis.nextQuestions.map((question: string, idx: number) => (
                                    <li key={idx} className="bg-background p-2 rounded border">
                                      • {question}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                              <div>
                                <span className="text-sm font-medium">Escalate to Provider:</span>
                                <Badge variant={call.aiAnalysis.escalateToProvider ? 'destructive' : 'secondary'} className="ml-2">
                                  {call.aiAnalysis.escalateToProvider ? 'Yes' : 'No'}
                                </Badge>
                              </div>
                              <div>
                                <span className="text-sm font-medium">Call ID:</span>
                                <span className="ml-2 text-sm font-mono">{call.id}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Call Metadata */}
                      <div>
                        <h4 className="font-medium mb-2">Call Technical Details</h4>
                        <div className="bg-muted p-3 rounded text-sm space-y-1">
                          <div><strong>Call ID:</strong> {call.id}</div>
                          <div><strong>Twilio Call SID:</strong> {call.twilioCallSid || 'N/A'}</div>
                          <div><strong>Started:</strong> {call.startedAt ? new Date(call.startedAt).toLocaleString() : 'N/A'}</div>
                          <div><strong>Completed:</strong> {call.completedAt ? new Date(call.completedAt).toLocaleString() : 'In Progress'}</div>
                          <div><strong>Outcome:</strong> {call.outcome || 'Pending'}</div>
                          <div><strong>Patient Condition:</strong> {call.condition || 'Not specified'}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}