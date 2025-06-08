import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, Clock, User, Download, Eye } from 'lucide-react';
import { format } from 'date-fns';
import Navigation from '@/components/navigation';

interface ConversationLog {
  filename: string;
  sessionId: string;
  patient: string;
  duration: string;
  date: string;
  createdAt: string;
  size: number;
}

interface ConversationContent {
  content: string;
}

export default function ConversationLogs() {
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const { data: logs = [], isLoading } = useQuery<ConversationLog[]>({
    queryKey: ['/api/conversation-logs'],
  });

  const { data: logContent } = useQuery<ConversationContent>({
    queryKey: ['/api/conversation-logs', selectedLog],
    enabled: !!selectedLog,
  });

  const downloadLog = (filename: string) => {
    const url = `/api/conversation-logs/${filename}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conversation Logs</h1>
          <p className="text-muted-foreground">Healthcare conversation transcripts and recordings</p>
        </div>
        <div className="text-center py-8">Loading conversation logs...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0 space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conversation Logs</h1>
          <p className="text-muted-foreground">
            Healthcare conversation transcripts and recordings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-8 w-8 text-blue-600" />
          <span className="text-sm font-medium">Transcripts</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{logs.length}</div>
            <p className="text-xs text-muted-foreground">Total Conversations</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {logs.reduce((acc, log) => acc + parseInt(log.duration.split(' ')[0] || '0'), 0)}s
            </div>
            <p className="text-xs text-muted-foreground">Total Talk Time</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {formatFileSize(logs.reduce((acc, log) => acc + log.size, 0))}
            </div>
            <p className="text-xs text-muted-foreground">Total Storage</p>
          </CardContent>
        </Card>
      </div>

      {/* Conversation List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No conversation logs found</p>
              <p className="text-sm">Start a conversation to see transcripts here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log, index) => (
                <div key={index} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">{log.patient}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.sessionId.split('_')[0]}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {log.date ? format(new Date(log.date), 'MMM d, yyyy') : 'Unknown date'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {log.duration}
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {formatFileSize(log.size)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedLog(log.filename)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh]">
                          <DialogHeader>
                            <DialogTitle>Conversation Transcript - {log.patient}</DialogTitle>
                          </DialogHeader>
                          <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
                            <pre className="text-sm whitespace-pre-wrap">
                              {logContent?.content || 'Loading transcript...'}
                            </pre>
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                      
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => downloadLog(log.filename)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
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