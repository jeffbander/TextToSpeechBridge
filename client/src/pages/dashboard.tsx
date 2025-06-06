import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import StatsCards from "@/components/dashboard/stats-cards";
import ActiveCalls from "@/components/dashboard/active-calls";
import RecentCalls from "@/components/dashboard/recent-calls";
import UrgentAlerts from "@/components/dashboard/urgent-alerts";
import ScheduledCalls from "@/components/dashboard/scheduled-calls";
import QuickActions from "@/components/dashboard/quick-actions";
import CallLogs from "@/components/dashboard/call-logs";
import LiveCallModal from "@/components/modals/live-call-modal";
import { Heart, Bell, User, Volume2, Settings, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";

export default function Dashboard() {
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // Subscribe to real-time updates
  useWebSocket();

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: activeCalls = [], isLoading: activeCallsLoading } = useQuery<any[]>({
    queryKey: ['/api/calls/active'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: recentCalls = [], isLoading: recentCallsLoading } = useQuery<any[]>({
    queryKey: ['/api/calls/recent'],
    refetchInterval: 10000,
  });

  const { data: urgentAlerts = [], isLoading: alertsLoading } = useQuery<any[]>({
    queryKey: ['/api/alerts/urgent'],
    refetchInterval: 5000,
  });

  const { data: scheduledCalls = [], isLoading: scheduledLoading } = useQuery<any[]>({
    queryKey: ['/api/calls/scheduled'],
    refetchInterval: 10000,
  });

  const handleListenToCall = (callId: number) => {
    setSelectedCallId(callId);
    setIsCallModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-surface shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Heart className="text-medical-blue text-2xl mr-3" />
                <span className="text-xl font-semibold text-gray-900">CardioCare AI</span>
              </div>
              <nav className="hidden md:ml-10 md:flex md:space-x-8">
                <Link href="/">
                  <span className="text-medical-blue border-b-2 border-medical-blue px-1 pb-4 text-sm font-medium cursor-pointer">Dashboard</span>
                </Link>
                <Link href="/patients">
                  <span className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium cursor-pointer">Patients</span>
                </Link>
                <span className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium">Calls</span>
                <span className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium">Reports</span>
                <Link href="/voice-settings">
                  <span className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium cursor-pointer">Settings</span>
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/voice-settings">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Voice Settings
                </Button>
              </Link>
              <Link href="/realtime">
                <Button variant="outline" size="sm" className="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
                  <Bot className="h-4 w-4 text-blue-600" />
                  GPT-4o Real-time
                </Button>
              </Link>
              <button className="relative p-2 text-gray-400 hover:text-gray-500">
                <Bell className="h-6 w-6" />
                {urgentAlerts.length > 0 && (
                  <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-error"></span>
                )}
              </button>
              <div className="flex items-center space-x-3">
                <User className="h-8 w-8 rounded-full bg-gray-200 p-1" />
                <span className="text-sm font-medium text-gray-700">Dr. Sarah Chen</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <StatsCards stats={stats} isLoading={statsLoading} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            <ActiveCalls 
              calls={activeCalls} 
              isLoading={activeCallsLoading}
              onListenToCall={handleListenToCall}
            />
            <CallLogs 
              calls={[...activeCalls, ...recentCalls]} 
              isLoading={activeCallsLoading || recentCallsLoading}
            />
            <RecentCalls 
              calls={recentCalls} 
              isLoading={recentCallsLoading}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <UrgentAlerts 
              alerts={urgentAlerts} 
              isLoading={alertsLoading}
            />
            <ScheduledCalls 
              calls={scheduledCalls} 
              isLoading={scheduledLoading}
            />
            <QuickActions />
          </div>
        </div>
      </div>

      {/* Live Call Modal */}
      <LiveCallModal 
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        callId={selectedCallId}
      />
    </div>
  );
}
