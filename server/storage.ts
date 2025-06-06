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
    // Jennifer Abe patient data
    const jenniferAbe = {
      name: "Abe, Jennifer",
      phoneNumber: "(929) 530-9452",
      email: null, // Missing email as specified
      dateOfBirth: "3/20/1986",
      mrn: "H406522",
      gender: "Female",
      address: "440 Berry St Apt 2M, Brooklyn, New York, 11249",
      systemId: "Abe_Jennifer__03_20_1986",
      condition: "Cardiology Follow-up",
      lastDischarge: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      riskLevel: "medium"
    };

    // Test patient with user's actual phone number
    const testPatient = {
      name: "Test Patient",
      phoneNumber: "+16465565559",
      email: "test@example.com",
      dateOfBirth: "1/1/1990",
      mrn: "T123456",
      gender: "Other",
      address: "123 Test St, Test City, NY, 10001",
      systemId: "Test_Patient__01_01_1990",
      condition: "Health Check",
      lastDischarge: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      riskLevel: "low"
    };

    // Create both patients
    await this.createPatient(jenniferAbe);
    await this.createPatient(testPatient);

    console.log('Test patient data initialized successfully');
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
