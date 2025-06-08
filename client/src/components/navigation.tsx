import { Heart, User, Volume2, FileText, Settings, Bot, BarChart3, Phone, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

export default function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: BarChart3 },
    { href: "/patients", label: "Patients", icon: User },
    { href: "/realtime", label: "Calls", icon: Volume2 },
    { href: "/automated-calls", label: "Auto Calls", icon: Phone },
    { href: "/conversation-logs", label: "Reports", icon: FileText },
    { href: "/voice-settings", label: "Voice Settings", icon: Settings },
    { href: "/patient-prompts", label: "Patient Prompts", icon: MessageSquare },
  ];

  return (
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
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <Button 
                    variant={isActive ? "default" : "outline"} 
                    size="sm"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            <Link href="/realtime">
              <Button variant="outline" size="sm" className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
                <Bot className="h-4 w-4 mr-2" />
                GPT-4o Preview
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}