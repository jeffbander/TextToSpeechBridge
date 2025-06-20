import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/error-boundary";
import Navigation from "@/components/navigation";
import Dashboard from "@/pages/dashboard";
import VoiceSettings from "@/pages/voice-settings";
import CustomPrompts from "@/pages/patient-prompts-manager";
import SMSTemplates from "@/pages/sms-templates";
import Patients from "@/pages/patients";
import RealtimePage from "@/pages/realtime";
import ConversationLogs from "@/pages/conversation-logs";
import AutomatedCallsPage from "@/pages/automated-calls";
import CsvImportPage from "@/pages/csv-import";
import CampaignDetailsPage from "@/pages/campaign-details";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/patients" component={Patients} />
      <Route path="/voice-settings" component={VoiceSettings} />
      <Route path="/custom-prompts" component={CustomPrompts} />
      <Route path="/realtime" component={RealtimePage} />
      <Route path="/conversation-logs" component={ConversationLogs} />
      <Route path="/automated-calls" component={AutomatedCallsPage} />
      <Route path="/csv-import" component={CsvImportPage} />
      <Route path="/campaigns/:id" component={CampaignDetailsPage} />
      <Route path="/sms-templates" component={SMSTemplates} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <Navigation />
            <Toaster />
            <Router />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
