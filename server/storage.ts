import { 
  patients, 
  calls, 
  scheduledCalls, 
  alerts,
  type Patient, 
  type InsertPatient,
  type Call,
  type InsertCall,
  type ScheduledCall,
  type InsertScheduledCall,
  type Alert,
  type InsertAlert
} from "@shared/schema";

export interface IStorage {
  // Patients
  getPatients(): Promise<Patient[]>;
  getPatient(id: number): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  
  // Calls
  getCalls(): Promise<Call[]>;
  getCall(id: number): Promise<Call | undefined>;
  getActiveCallsByPatientId(patientId: number): Promise<Call[]>;
  getActiveCalls(): Promise<Call[]>;
  createCall(call: InsertCall): Promise<Call>;
  updateCall(id: number, updates: Partial<Call>): Promise<Call | undefined>;
  
  // Scheduled Calls
  getScheduledCalls(): Promise<ScheduledCall[]>;
  getPendingScheduledCalls(): Promise<ScheduledCall[]>;
  createScheduledCall(scheduledCall: InsertScheduledCall): Promise<ScheduledCall>;
  updateScheduledCall(id: number, updates: Partial<ScheduledCall>): Promise<ScheduledCall | undefined>;
  
  // Alerts
  getAlerts(): Promise<Alert[]>;
  getUnresolvedAlerts(): Promise<Alert[]>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  updateAlert(id: number, updates: Partial<Alert>): Promise<Alert | undefined>;
}

export class MemStorage implements IStorage {
  private patients: Map<number, Patient>;
  private calls: Map<number, Call>;
  private scheduledCalls: Map<number, ScheduledCall>;
  private alerts: Map<number, Alert>;
  private currentPatientId: number;
  private currentCallId: number;
  private currentScheduledCallId: number;
  private currentAlertId: number;

  constructor() {
    this.patients = new Map();
    this.calls = new Map();
    this.scheduledCalls = new Map();
    this.alerts = new Map();
    this.currentPatientId = 1;
    this.currentCallId = 1;
    this.currentScheduledCallId = 1;
    this.currentAlertId = 1;
    
    // Initialize with sample patient data for demonstration
    this.initializeSampleData();
  }

  private async initializeSampleData() {
    // Sample patients
    const samplePatients = [
      {
        name: "Robert Johnson",
        phoneNumber: "+1-555-0123",
        email: "robert.johnson@email.com",
        condition: "Post-Cardiac Surgery",
        lastDischarge: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        riskLevel: "medium"
      },
      {
        name: "Maria Santos",
        phoneNumber: "+1-555-0124",
        email: "maria.santos@email.com", 
        condition: "CHF Management",
        lastDischarge: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        riskLevel: "high"
      },
      {
        name: "David Chen",
        phoneNumber: "+15551234567", // This will be updated with a real number for testing
        email: "david.chen@email.com",
        condition: "Hypertension Follow-up",
        lastDischarge: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        riskLevel: "low"
      },
      {
        name: "Sarah Williams",
        phoneNumber: "+1-555-0126", 
        email: "sarah.williams@email.com",
        condition: "Diabetes Management",
        lastDischarge: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        riskLevel: "medium"
      },
      {
        name: "Michael Brown",
        phoneNumber: "+1-555-0127",
        email: "michael.brown@email.com",
        condition: "Post-Stroke Care",
        lastDischarge: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        riskLevel: "high"
      }
    ];

    // Create patients
    for (const patientData of samplePatients) {
      await this.createPatient(patientData);
    }

    // Create some sample recent calls
    const recentCalls = [
      {
        patientId: 1,
        status: "completed",
        duration: 180,
        outcome: "routine",
        transcript: JSON.stringify([
          { speaker: "ai", text: "Hello Mr. Johnson, this is your CardioCare follow-up assistant. How are you feeling today?", timestamp: new Date() },
          { speaker: "patient", text: "I'm doing well, thank you. Just some minor soreness from the surgery.", timestamp: new Date() },
          { speaker: "ai", text: "That's normal for this stage of recovery. Are you taking your medications as prescribed?", timestamp: new Date() },
          { speaker: "patient", text: "Yes, I'm taking everything as directed.", timestamp: new Date() }
        ]),
        aiAnalysis: {
          urgencyLevel: "low",
          symptoms: ["minor soreness"],
          concerns: [],
          followUpRequired: false,
          escalateToProvider: false,
          summary: "Patient recovering well from cardiac surgery, minor expected soreness, good medication compliance"
        },
        alertLevel: "none",
        twilioCallSid: "CA1234567890abcdef1234567890abcdef"
      },
      {
        patientId: 2,
        status: "completed", 
        duration: 240,
        outcome: "escalated",
        transcript: JSON.stringify([
          { speaker: "ai", text: "Hello Mrs. Santos, this is your CardioCare follow-up assistant. How are you feeling today?", timestamp: new Date() },
          { speaker: "patient", text: "I've been having more trouble breathing and my ankles are really swollen.", timestamp: new Date() },
          { speaker: "ai", text: "I'm concerned about these symptoms. Have you been taking your water pills as prescribed?", timestamp: new Date() },
          { speaker: "patient", text: "I ran out yesterday and haven't been able to get to the pharmacy.", timestamp: new Date() }
        ]),
        aiAnalysis: {
          urgencyLevel: "high",
          symptoms: ["shortness of breath", "ankle swelling"],
          concerns: ["medication non-compliance", "CHF exacerbation"],
          followUpRequired: true,
          escalateToProvider: true,
          summary: "CHF patient with worsening symptoms and medication non-compliance - requires immediate provider contact"
        },
        alertLevel: "urgent",
        twilioCallSid: "CA2234567890abcdef1234567890abcdef"
      }
    ];

    // Create recent calls
    for (const callData of recentCalls) {
      const call = await this.createCall(callData);
      // Mark as completed
      await this.updateCall(call.id, { 
        completedAt: new Date(Date.now() - Math.random() * 2 * 60 * 60 * 1000) // Within last 2 hours
      });
    }

    // Create some scheduled calls
    const scheduledCallsData = [
      {
        patientId: 3,
        scheduledTime: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        callType: "post-discharge"
      },
      {
        patientId: 4,
        scheduledTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        callType: "medication-check"
      },
      {
        patientId: 5,
        scheduledTime: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
        callType: "routine"
      }
    ];

    // Create scheduled calls
    for (const scheduleData of scheduledCallsData) {
      await this.createScheduledCall(scheduleData);
    }

    // Create some urgent alerts
    const urgentAlerts = [
      {
        patientId: 2,
        callId: 2,
        type: "urgent",
        message: "Patient reports worsening CHF symptoms and medication non-compliance"
      },
      {
        patientId: 5,
        callId: null,
        type: "warning", 
        message: "Patient missed last two scheduled calls"
      }
    ];

    // Create alerts
    for (const alertData of urgentAlerts) {
      await this.createAlert(alertData);
    }

    console.log('Sample patient data initialized successfully');
  }

  // Patients
  async getPatients(): Promise<Patient[]> {
    return Array.from(this.patients.values());
  }

  async getPatient(id: number): Promise<Patient | undefined> {
    return this.patients.get(id);
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const id = this.currentPatientId++;
    const patient: Patient = { 
      ...insertPatient,
      id,
      email: insertPatient.email ?? null,
      lastDischarge: insertPatient.lastDischarge ?? null,
      riskLevel: insertPatient.riskLevel ?? "low",
      createdAt: new Date()
    };
    this.patients.set(id, patient);
    return patient;
  }

  // Calls
  async getCalls(): Promise<Call[]> {
    return Array.from(this.calls.values());
  }

  async getCall(id: number): Promise<Call | undefined> {
    return this.calls.get(id);
  }

  async getActiveCallsByPatientId(patientId: number): Promise<Call[]> {
    return Array.from(this.calls.values()).filter(
      call => call.patientId === patientId && call.status === 'active'
    );
  }

  async getActiveCalls(): Promise<Call[]> {
    return Array.from(this.calls.values()).filter(call => call.status === 'active');
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    const id = this.currentCallId++;
    const call: Call = { 
      ...insertCall,
      id,
      duration: insertCall.duration ?? null,
      outcome: insertCall.outcome ?? null,
      transcript: insertCall.transcript ?? null,
      aiAnalysis: insertCall.aiAnalysis ?? null,
      alertLevel: insertCall.alertLevel ?? null,
      twilioCallSid: insertCall.twilioCallSid ?? null,
      startedAt: new Date(),
      completedAt: null
    };
    this.calls.set(id, call);
    return call;
  }

  async updateCall(id: number, updates: Partial<Call>): Promise<Call | undefined> {
    const call = this.calls.get(id);
    if (!call) return undefined;
    
    const updatedCall = { ...call, ...updates };
    this.calls.set(id, updatedCall);
    return updatedCall;
  }

  // Scheduled Calls
  async getScheduledCalls(): Promise<ScheduledCall[]> {
    return Array.from(this.scheduledCalls.values());
  }

  async getPendingScheduledCalls(): Promise<ScheduledCall[]> {
    return Array.from(this.scheduledCalls.values()).filter(call => !call.completed);
  }

  async createScheduledCall(insertScheduledCall: InsertScheduledCall): Promise<ScheduledCall> {
    const id = this.currentScheduledCallId++;
    const scheduledCall: ScheduledCall = { 
      ...insertScheduledCall, 
      id,
      completed: false,
      createdAt: new Date()
    };
    this.scheduledCalls.set(id, scheduledCall);
    return scheduledCall;
  }

  async updateScheduledCall(id: number, updates: Partial<ScheduledCall>): Promise<ScheduledCall | undefined> {
    const scheduledCall = this.scheduledCalls.get(id);
    if (!scheduledCall) return undefined;
    
    const updatedCall = { ...scheduledCall, ...updates };
    this.scheduledCalls.set(id, updatedCall);
    return updatedCall;
  }

  // Alerts
  async getAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values());
  }

  async getUnresolvedAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    const id = this.currentAlertId++;
    const alert: Alert = { 
      ...insertAlert,
      id,
      callId: insertAlert.callId ?? null,
      resolved: false,
      createdAt: new Date()
    };
    this.alerts.set(id, alert);
    return alert;
  }

  async updateAlert(id: number, updates: Partial<Alert>): Promise<Alert | undefined> {
    const alert = this.alerts.get(id);
    if (!alert) return undefined;
    
    const updatedAlert = { ...alert, ...updates };
    this.alerts.set(id, updatedAlert);
    return updatedAlert;
  }
}

export const storage = new MemStorage();
