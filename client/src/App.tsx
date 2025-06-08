import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import VoiceSettings from "@/pages/voice-settings";
import Patients from "@/pages/patients";
import RealtimePage from "@/pages/realtime";
import ConversationLogs from "@/pages/conversation-logs";
import AutomatedCallsPage from "@/pages/automated-calls";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/patients" component={Patients} />
      <Route path="/voice-settings" component={VoiceSettings} />
      <Route path="/realtime" component={RealtimePage} />
      <Route path="/conversation-logs" component={ConversationLogs} />
      <Route path="/automated-calls" component={AutomatedCallsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
