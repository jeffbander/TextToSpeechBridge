import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { HamburgerMenu, DesktopNavigation } from "@/components/hamburger-menu";
import { Phone, Users, Heart } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm mb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          {/* Left side - Logo and hamburger menu */}
          <div className="flex items-center gap-4">
            <HamburgerMenu />
            <Link href="/">
              <div className="flex items-center gap-3">
                <Heart className="h-8 w-8 text-red-500" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    CardioCare AI
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                    Patient Outreach Dashboard
                  </p>
                </div>
              </div>
            </Link>
          </div>

          {/* Center - Primary navigation buttons */}
          <div className="flex items-center gap-3">
            <Link href="/automated-calls">
              <Button
                variant={location === "/automated-calls" ? "default" : "outline"}
                size="sm"
                className="gap-2"
              >
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">Auto Calls</span>
                <span className="sm:hidden">Calls</span>
              </Button>
            </Link>
            <Link href="/patients">
              <Button
                variant={location === "/patients" ? "default" : "outline"}
                size="sm"
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                Patients
              </Button>
            </Link>
          </div>

          {/* Right side - Desktop navigation (hidden on mobile) */}
          <div className="hidden md:block">
            <DesktopNavigation />
          </div>
        </div>
      </div>
    </header>
  );
}