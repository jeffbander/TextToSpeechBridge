import { useQuery } from "@tanstack/react-query";
import { Heart, Bell, User, Volume2, Settings, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";

interface DashboardStats {
  callsToday: number;
  urgentAlerts: number;
  successRate: number;
  activePatients: number;
  activeCalls: number;
  pendingCalls: number;
}

interface ActiveCall {
  id: number;
  patientName: string;
  phoneNumber: string;
  status: string;
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000,
  });

  const { data: activeCalls = [], isLoading: activeCallsLoading } = useQuery<ActiveCall[]>({
    queryKey: ['/api/calls/active'],
    refetchInterval: 10000,
  });

  if (statsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="text-center">Loading CardioCare AI Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Heart className="h-8 w-8 text-red-500 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">CardioCare AI</h1>
                <p className="text-sm text-gray-500">Patient Outreach Dashboard</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/realtime">
                <Button variant="outline" size="sm">
                  <Bot className="h-4 w-4 mr-2" />
                  GPT-4o Preview
                </Button>
              </Link>
              <Link href="/patients">
                <Button variant="outline" size="sm">
                  <User className="h-4 w-4 mr-2" />
                  Patients
                </Button>
              </Link>
              <Link href="/voice-settings">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Calls Today</CardTitle>
                <Volume2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.callsToday || 0}</div>
                <p className="text-xs text-muted-foreground">+{stats?.callsToday || 0} from yesterday</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <Heart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.successRate || 0}%</div>
                <p className="text-xs text-muted-foreground">Completed calls</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Calls</CardTitle>
                <Volume2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Array.isArray(activeCalls) ? activeCalls.length : 0}</div>
                <p className="text-xs text-muted-foreground">Currently in progress</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Urgent Alerts</CardTitle>
                <Bell className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.urgentAlerts || 0}</div>
                <p className="text-xs text-muted-foreground">Require attention</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Start patient outreach and manage calls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Link href="/patients">
                  <Button className="w-full">
                    <User className="h-4 w-4 mr-2" />
                    Manage Patients
                  </Button>
                </Link>
                <Link href="/realtime">
                  <Button variant="outline" className="w-full">
                    <Bot className="h-4 w-4 mr-2" />
                    Test GPT-4o Real-time
                  </Button>
                </Link>
                <Link href="/voice-settings">
                  <Button variant="outline" className="w-full">
                    <Settings className="h-4 w-4 mr-2" />
                    Voice Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Calls</CardTitle>
                <CardDescription>Monitor ongoing patient conversations</CardDescription>
              </CardHeader>
              <CardContent>
                {activeCallsLoading ? (
                  <div className="text-sm text-gray-500">Loading active calls...</div>
                ) : Array.isArray(activeCalls) && activeCalls.length > 0 ? (
                  <div className="space-y-2">
                    {activeCalls.map((call) => (
                      <div key={call.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                        <div>
                          <div className="font-medium">{call.patientName}</div>
                          <div className="text-sm text-gray-500">{call.phoneNumber}</div>
                        </div>
                        <div className="text-sm text-green-600">Active</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No active calls</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>CardioCare AI platform health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Twilio Voice Service</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">OpenAI GPT-4o</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Real-time Analytics</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}