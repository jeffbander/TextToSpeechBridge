export interface DashboardStats {
  callsToday: number;
  urgentAlerts: number;
  successRate: number;
  activePatients: number;
  activeCalls: number;
  pendingCalls: number;
}

export interface CallDetails {
  id: number;
  patientId: number;
  patientName: string;
  phoneNumber: string;
  condition: string;
  status: string;
  duration: number | null;
  outcome: string | null;
  transcript: string | null;
  aiAnalysis: any;
  alertLevel: string;
  startedAt: string;
  completedAt: string | null;
  twilioCallSid: string | null;
}

export interface Alert {
  id: number;
  patientId: number;
  patientName: string;
  phoneNumber: string;
  callId: number | null;
  type: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

export interface ScheduledCall {
  id: number;
  patientId: number;
  patientName: string;
  phoneNumber: string;
  scheduledTime: string;
  callType: string;
  completed: boolean;
  createdAt: string;
}

// API client functions could be added here for type safety
// For now, we're using the queryClient with direct fetch calls
