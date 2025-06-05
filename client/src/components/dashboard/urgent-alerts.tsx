import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertCircle, Pill } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface UrgentAlertsProps {
  alerts: any[];
  isLoading: boolean;
}

export default function UrgentAlerts({ alerts, isLoading }: UrgentAlertsProps) {
  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'urgent':
        return <AlertCircle className="text-error" />;
      case 'warning':
        return <AlertTriangle className="text-warning" />;
      case 'medication':
        return <Pill className="text-warning" />;
      default:
        return <AlertTriangle className="text-warning" />;
    }
  };

  const getAlertBorder = (type: string) => {
    switch (type) {
      case 'urgent':
        return 'border-error';
      case 'warning':
        return 'border-warning';
      case 'medication':
        return 'border-warning';
      default:
        return 'border-warning';
    }
  };

  const getAlertBackground = (type: string) => {
    switch (type) {
      case 'urgent':
        return 'bg-red-50';
      case 'warning':
        return 'bg-orange-50';
      case 'medication':
        return 'bg-orange-50';
      default:
        return 'bg-orange-50';
    }
  };

  const getAlertButtonColor = (type: string) => {
    switch (type) {
      case 'urgent':
        return 'bg-red-600 hover:bg-red-700';
      case 'warning':
        return 'bg-orange-600 hover:bg-orange-700';
      case 'medication':
        return 'bg-orange-600 hover:bg-orange-700';
      default:
        return 'bg-orange-600 hover:bg-orange-700';
    }
  };

  const formatTimeAgo = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffInMinutes = Math.floor((now.getTime() - created.getTime()) / 60000);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border-l-4 border-gray-300 bg-gray-50 p-4 rounded-r-lg">
              <div className="flex">
                <Skeleton className="w-5 h-5 mr-3" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-32 mb-2" />
                  <Skeleton className="h-3 w-20 mb-3" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Urgent Alerts</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No urgent alerts</p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={`border-l-4 ${getAlertBorder(alert.type)} ${getAlertBackground(alert.type)} p-4 rounded-r-lg`}
              >
                <div className="flex">
                  <div className="flex-shrink-0">
                    {getAlertIcon(alert.type)}
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-red-800">{alert.patientName}</p>
                    <p className="text-sm text-red-700">{alert.message}</p>
                    <p className="text-xs text-red-600 mt-1">{formatTimeAgo(alert.createdAt)}</p>
                    <div className="mt-2">
                      <Button 
                        size="sm"
                        className={`text-xs text-white px-3 py-1 rounded-md ${getAlertButtonColor(alert.type)}`}
                      >
                        {alert.type === 'urgent' ? 'Contact MD' : 
                         alert.type === 'medication' ? 'Send Reminder' : 'Schedule Follow-up'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
