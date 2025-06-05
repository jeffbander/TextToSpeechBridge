import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import StatsCards from "@/components/dashboard/stats-cards";
import ActiveCalls from "@/components/dashboard/active-calls";
import RecentCalls from "@/components/dashboard/recent-calls";
import UrgentAlerts from "@/components/dashboard/urgent-alerts";
import ScheduledCalls from "@/components/dashboard/scheduled-calls";
import QuickActions from "@/components/dashboard/quick-actions";
import LiveCallModal from "@/components/modals/live-call-modal";
import { Heart, Bell, User } from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // Subscribe to real-time updates
  useWebSocket();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: activeCalls = [], isLoading: activeCallsLoading } = useQuery({
    queryKey: ['/api/calls/active'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: recentCalls = [], isLoading: recentCallsLoading } = useQuery({
    queryKey: ['/api/calls/recent'],
    refetchInterval: 10000,
  });

  const { data: urgentAlerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/alerts/urgent'],
    refetchInterval: 5000,
  });

  const { data: scheduledCalls = [], isLoading: scheduledLoading } = useQuery({
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
                <a href="#" className="text-medical-blue border-b-2 border-medical-blue px-1 pb-4 text-sm font-medium">Dashboard</a>
                <a href="#" className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium">Patients</a>
                <a href="#" className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium">Calls</a>
                <a href="#" className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium">Reports</a>
                <a href="#" className="text-gray-500 hover:text-gray-700 px-1 pb-4 text-sm font-medium">Settings</a>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
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
