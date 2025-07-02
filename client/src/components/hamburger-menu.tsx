import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Home, Settings, MessageSquare, FileText, Users, Activity, Upload, Bot, Mic } from "lucide-react";

interface NavigationItem {
  label: string;
  path: string;
  icon: any;
}

// Items to show in top bar (first 3 navigation items)
const topBarItems: NavigationItem[] = [
  { label: "Conversation Logs", path: "/conversation-logs", icon: MessageSquare },
  { label: "Voice Settings", path: "/voice-settings", icon: Settings },
  { label: "Custom Prompts", path: "/custom-prompts", icon: FileText },
];

// Items only in hamburger menu
const hamburgerOnlyItems: NavigationItem[] = [
  { label: "Dashboard", path: "/", icon: Home },
  { label: "Real-time Testing", path: "/realtime", icon: Activity },
  { label: "CSV Import", path: "/csv-import", icon: Upload },
];

// All items for hamburger menu (complete list)
const allNavigationItems: NavigationItem[] = [
  { label: "Dashboard", path: "/", icon: Home },
  { label: "Conversation Logs", path: "/conversation-logs", icon: MessageSquare },
  { label: "Voice Settings", path: "/voice-settings", icon: Settings },
  { label: "Custom Prompts", path: "/custom-prompts", icon: FileText },
  { label: "Real-time Testing", path: "/realtime", icon: Activity },
  { label: "CSV Import", path: "/csv-import", icon: Upload },
  { label: "Hume AI Integration", path: "/hume-integration", icon: Mic },
  { label: "AIGENTS Automation", path: "/aigents-automation", icon: Bot },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <div className="flex flex-col gap-4 mt-8">
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            CardioCare AI
          </div>
          <nav className="flex flex-col gap-2">
            {allNavigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className="w-full justify-start gap-3"
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function DesktopNavigation() {
  const [location] = useLocation();

  return (
    <nav className="flex items-center gap-2">
      {topBarItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.path;
        
        return (
          <Link key={item.path} href={item.path}>
            <Button
              variant={isActive ? "default" : "ghost"}
              size="sm"
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden lg:inline">{item.label}</span>
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}