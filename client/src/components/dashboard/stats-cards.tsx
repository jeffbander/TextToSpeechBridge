import { Card, CardContent } from "@/components/ui/card";
import { Phone, AlertTriangle, CheckCircle, Users, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardsProps {
  stats?: {
    callsToday: number;
    urgentAlerts: number;
    successRate: number;
    activePatients: number;
    activeCalls: number;
    pendingCalls: number;
  };
  isLoading: boolean;
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-8 mb-4" />
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16 mb-4" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-gray-500">No data available</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Phone className="text-medical-blue text-2xl" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Calls Today</dt>
                <dd className="text-2xl font-semibold text-gray-900">{stats.callsToday}</dd>
              </dl>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm text-success">
              <TrendingUp className="w-4 h-4 mr-1" />
              <span>12% from yesterday</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className={`text-2xl ${stats.urgentAlerts > 0 ? 'text-warning' : 'text-gray-400'}`} />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Urgent Alerts</dt>
                <dd className="text-2xl font-semibold text-gray-900">{stats.urgentAlerts}</dd>
              </dl>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm text-error">
              <TrendingUp className="w-4 h-4 mr-1" />
              <span>{stats.urgentAlerts > 0 ? `${stats.urgentAlerts} new today` : 'No alerts'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="text-success text-2xl" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
                <dd className="text-2xl font-semibold text-gray-900">{stats.successRate}%</dd>
              </dl>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm text-success">
              <TrendingUp className="w-4 h-4 mr-1" />
              <span>2.1% improvement</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="text-medical-blue text-2xl" />
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">Active Patients</dt>
                <dd className="text-2xl font-semibold text-gray-900">{stats.activePatients}</dd>
              </dl>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm text-gray-500">
              <span>{stats.pendingCalls} pending calls</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
