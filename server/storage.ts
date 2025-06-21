import { 
  patients, 
  calls, 
  scheduledCalls, 
  alerts,
  callCampaigns,
  callAttempts,
  messages,
  type Patient, 
  type InsertPatient,
  type Call,
  type InsertCall,
  type ScheduledCall,
  type InsertScheduledCall,
  type Alert,
  type InsertAlert,
  type CallCampaign,
  type InsertCallCampaign,
  type CallAttempt,
  type InsertCallAttempt,
  type Message,
  type InsertMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Patients
  getPatients(): Promise<Patient[]>;
  getPatient(id: number): Promise<Patient | undefined>;
  getPatientBySystemId(systemId: string): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: number, updates: Partial<Patient>): Promise<Patient | undefined>;
  
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
  
  // Call Campaigns
  getCallCampaigns(): Promise<CallCampaign[]>;
  getCallCampaign(id: number): Promise<CallCampaign | undefined>;
  createCallCampaign(campaign: InsertCallCampaign): Promise<CallCampaign>;
  updateCallCampaign(id: number, updates: Partial<CallCampaign>): Promise<CallCampaign | undefined>;
  
  // Call Attempts
  getCallAttempts(): Promise<CallAttempt[]>;
  getCallAttemptsByCampaign(campaignId: number): Promise<CallAttempt[]>;
  getPendingCallAttempts(): Promise<CallAttempt[]>;
  createCallAttempt(attempt: InsertCallAttempt): Promise<CallAttempt>;
  updateCallAttempt(id: number, updates: Partial<CallAttempt>): Promise<CallAttempt | undefined>;

  // Messages
  getMessagesByPatient(patientId: number): Promise<Message[]>;
  createMessage(insertMessage: InsertMessage): Promise<Message>;
  updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined>;
}

export class MemStorage implements IStorage {
  private patients: Map<number, Patient>;
  private calls: Map<number, Call>;
  private scheduledCalls: Map<number, ScheduledCall>;
  private alerts: Map<number, Alert>;
  private callCampaigns: Map<number, CallCampaign>;
  private callAttempts: Map<number, CallAttempt>;
  private messages: Map<number, Message>;
  private currentPatientId: number;
  private currentCallId: number;
  private currentScheduledCallId: number;
  private currentAlertId: number;
  private currentMessageId: number;

  constructor() {
    this.patients = new Map();
    this.calls = new Map();
    this.scheduledCalls = new Map();
    this.alerts = new Map();
    this.callCampaigns = new Map();
    this.callAttempts = new Map();
    this.messages = new Map();
    this.currentPatientId = 1;
    this.currentCallId = 1;
    this.currentScheduledCallId = 1;
    this.currentAlertId = 1;
    this.currentMessageId = 1;
    
    // Initialize with sample patient data for demonstration
    this.initializeSampleData();
  }

  private async initializeSampleData() {
    // Jennifer Abe patient data
    const jenniferAbe = {
      firstName: "Jennifer",
      lastName: "Abe",
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
      firstName: "Test",
      lastName: "Patient",
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

  async getPatientBySystemId(systemId: string): Promise<Patient | undefined> {
    return Array.from(this.patients.values()).find(patient => patient.systemId === systemId);
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const id = this.currentPatientId++;
    const patient: Patient = { 
      ...insertPatient,
      id,
      alternatePhoneNumber: insertPatient.alternatePhoneNumber ?? null,
      email: insertPatient.email ?? null,
      lastDischarge: insertPatient.lastDischarge ?? null,
      riskLevel: insertPatient.riskLevel ?? "low",
      customPrompt: insertPatient.customPrompt ?? null,
      promptMetadata: insertPatient.promptMetadata ?? null,
      importedFrom: insertPatient.importedFrom ?? null,
      createdAt: new Date()
    };
    this.patients.set(id, patient);
    return patient;
  }

  async updatePatient(id: number, updates: Partial<Patient>): Promise<Patient | undefined> {
    const existingPatient = this.patients.get(id);
    if (!existingPatient) {
      return undefined;
    }
    
    const updatedPatient: Patient = {
      ...existingPatient,
      ...updates,
      id // Ensure ID cannot be changed
    };
    
    this.patients.set(id, updatedPatient);
    return updatedPatient;
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
      id,
      patientId: insertCall.patientId,
      status: insertCall.status,
      callType: insertCall.callType ?? null,
      metadata: insertCall.metadata ?? null,
      duration: insertCall.duration ?? null,
      outcome: insertCall.outcome ?? null,
      successRating: insertCall.successRating ?? null,
      qualityScore: insertCall.qualityScore ?? null,
      informationGathered: insertCall.informationGathered ?? false,
      transcript: insertCall.transcript ?? null,
      aiAnalysis: insertCall.aiAnalysis ?? null,
      alertLevel: insertCall.alertLevel ?? null,
      customPrompt: insertCall.customPrompt ?? null,
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

  // Call Campaigns
  async getCallCampaigns(): Promise<CallCampaign[]> {
    return Array.from(this.callCampaigns.values());
  }

  async getCallCampaign(id: number): Promise<CallCampaign | undefined> {
    return this.callCampaigns.get(id);
  }

  async createCallCampaign(insertCampaign: InsertCallCampaign): Promise<CallCampaign> {
    const id = Date.now(); // Simple ID generation for memory storage
    const campaign: CallCampaign = {
      ...insertCampaign,
      id,
      createdAt: new Date(),
      completedAt: null
    };
    this.callCampaigns.set(id, campaign);
    return campaign;
  }

  async updateCallCampaign(id: number, updates: Partial<CallCampaign>): Promise<CallCampaign | undefined> {
    const campaign = this.callCampaigns.get(id);
    if (!campaign) return undefined;
    
    const updatedCampaign = { ...campaign, ...updates };
    this.callCampaigns.set(id, updatedCampaign);
    return updatedCampaign;
  }

  // Call Attempts
  async getCallAttempts(): Promise<CallAttempt[]> {
    return Array.from(this.callAttempts.values());
  }

  async getCallAttemptsByCampaign(campaignId: number): Promise<CallAttempt[]> {
    return Array.from(this.callAttempts.values()).filter(attempt => attempt.campaignId === campaignId);
  }

  async getPendingCallAttempts(): Promise<CallAttempt[]> {
    return Array.from(this.callAttempts.values()).filter(attempt => attempt.status === 'pending');
  }

  async createCallAttempt(insertAttempt: InsertCallAttempt): Promise<CallAttempt> {
    const id = Date.now() + Math.random(); // Simple ID generation
    const attempt: CallAttempt = {
      ...insertAttempt,
      id,
      callId: insertAttempt.callId ?? null,
      scheduledAt: insertAttempt.scheduledAt ?? null,
      startedAt: insertAttempt.startedAt ?? null,
      completedAt: insertAttempt.completedAt ?? null,
      failureReason: insertAttempt.failureReason ?? null,
      nextRetryAt: insertAttempt.nextRetryAt ?? null,
      metadata: insertAttempt.metadata ?? null,
      createdAt: new Date()
    };
    this.callAttempts.set(id, attempt);
    return attempt;
  }

  async updateCallAttempt(id: number, updates: Partial<CallAttempt>): Promise<CallAttempt | undefined> {
    const attempt = this.callAttempts.get(id);
    if (!attempt) return undefined;
    
    const updatedAttempt = { ...attempt, ...updates };
    this.callAttempts.set(id, updatedAttempt);
    return updatedAttempt;
  }

  // Messages
  async getMessagesByPatient(patientId: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(message => message.patientId === patientId);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentMessageId++;
    const message: Message = {
      id,
      patientId: insertMessage.patientId,
      direction: insertMessage.direction,
      message: insertMessage.message,
      status: insertMessage.status,
      twilioSid: insertMessage.twilioSid ?? null,
      errorMessage: insertMessage.errorMessage ?? null,
      sentAt: new Date(),
      receivedAt: insertMessage.receivedAt ?? null,
    };
    this.messages.set(id, message);
    return message;
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined> {
    const message = this.messages.get(id);
    if (!message) return undefined;
    
    const updatedMessage = { ...message, ...updates };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }
}

export class DatabaseStorage implements IStorage {
  constructor() {
    this.initializeSampleData();
  }

  private async initializeSampleData() {
    try {
      // Check if data already exists
      const existingPatients = await db.select().from(patients);
      if (existingPatients.length > 0) {
        console.log('Database already contains patient data, skipping initialization');
        return;
      }

      // Add sample patients with firstName/lastName and proper systemId format
      const samplePatients = [
        {
          firstName: "Jennifer",
          lastName: "Abe",
          phoneNumber: "+15551234567",
          email: "jennifer.abe@email.com",
          dateOfBirth: "1975-03-15",
          mrn: "MRN001",
          gender: "Female",
          address: "123 Main St, Anytown, ST 12345",
          systemId: "Abe_Jennifer__03/15/1975",
          condition: "Post-Cardiac Surgery",
          riskLevel: "medium" as const
        },
        {
          firstName: "Michael",
          lastName: "Johnson",
          phoneNumber: "+15551234569",
          email: "michael.johnson@email.com",
          dateOfBirth: "1962-08-22",
          mrn: "MRN002",
          gender: "Male",
          address: "456 Oak Ave, Somewhere, ST 67890",
          systemId: "Johnson_Michael__08/22/1962",
          condition: "CHF Follow-up",
          riskLevel: "high" as const
        },
        {
          firstName: "Maria",
          lastName: "Garcia",
          phoneNumber: "+15551234571",
          email: "maria.garcia@email.com",
          dateOfBirth: "1989-12-03",
          mrn: "MRN003",
          gender: "Female",
          address: "789 Pine Rd, Elsewhere, ST 54321",
          systemId: "Garcia_Maria__12/03/1989",
          condition: "Diabetes Management",
          riskLevel: "low" as const
        }
      ];

      await db.insert(patients).values(samplePatients);
      console.log('Database initialized with sample patient data');
    } catch (error) {
      console.error('Error initializing sample data:', error);
    }
  }

  async getPatients(): Promise<Patient[]> {
    try {
      return await db.select().from(patients);
    } catch (error) {
      console.error('Database error fetching patients:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async getPatient(id: number): Promise<Patient | undefined> {
    try {
      const [patient] = await db.select().from(patients).where(eq(patients.id, id));
      return patient || undefined;
    } catch (error) {
      console.error('Database error fetching patient:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async createPatient(insertPatient: InsertPatient): Promise<Patient> {
    const [patient] = await db
      .insert(patients)
      .values(insertPatient)
      .returning();
    return patient;
  }

  async getPatientBySystemId(systemId: string): Promise<Patient | undefined> {
    try {
      const [patient] = await db.select().from(patients).where(eq(patients.systemId, systemId));
      return patient || undefined;
    } catch (error) {
      console.error('Database error fetching patient by system ID:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async updatePatient(id: number, updates: Partial<Patient>): Promise<Patient | undefined> {
    const [patient] = await db
      .update(patients)
      .set(updates)
      .where(eq(patients.id, id))
      .returning();
    return patient || undefined;
  }

  async getCalls(): Promise<Call[]> {
    try {
      return await db.select().from(calls);
    } catch (error) {
      console.error('Database error fetching calls:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async getCall(id: number): Promise<Call | undefined> {
    try {
      const [call] = await db.select().from(calls).where(eq(calls.id, id));
      return call || undefined;
    } catch (error) {
      console.error('Database error fetching call:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async getActiveCallsByPatientId(patientId: number): Promise<Call[]> {
    return await db.select().from(calls).where(
      and(eq(calls.patientId, patientId), eq(calls.status, 'in_progress'))
    );
  }

  async getActiveCalls(): Promise<Call[]> {
    return await db.select().from(calls).where(eq(calls.status, 'in_progress'));
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    const [call] = await db
      .insert(calls)
      .values(insertCall)
      .returning();
    return call;
  }

  async updateCall(id: number, updates: Partial<Call>): Promise<Call | undefined> {
    const [call] = await db
      .update(calls)
      .set(updates)
      .where(eq(calls.id, id))
      .returning();
    return call || undefined;
  }

  async getScheduledCalls(): Promise<ScheduledCall[]> {
    return await db.select().from(scheduledCalls);
  }

  async getPendingScheduledCalls(): Promise<ScheduledCall[]> {
    return await db.select().from(scheduledCalls).where(eq(scheduledCalls.completed, false));
  }

  async createScheduledCall(insertScheduledCall: InsertScheduledCall): Promise<ScheduledCall> {
    const [scheduledCall] = await db
      .insert(scheduledCalls)
      .values(insertScheduledCall)
      .returning();
    return scheduledCall;
  }

  async updateScheduledCall(id: number, updates: Partial<ScheduledCall>): Promise<ScheduledCall | undefined> {
    const [scheduledCall] = await db
      .update(scheduledCalls)
      .set(updates)
      .where(eq(scheduledCalls.id, id))
      .returning();
    return scheduledCall || undefined;
  }

  async getAlerts(): Promise<Alert[]> {
    return await db.select().from(alerts);
  }

  async getUnresolvedAlerts(): Promise<Alert[]> {
    return await db.select().from(alerts).where(eq(alerts.resolved, false));
  }

  async createAlert(insertAlert: InsertAlert): Promise<Alert> {
    const [alert] = await db
      .insert(alerts)
      .values(insertAlert)
      .returning();
    return alert;
  }

  async updateAlert(id: number, updates: Partial<Alert>): Promise<Alert | undefined> {
    const [alert] = await db
      .update(alerts)
      .set(updates)
      .where(eq(alerts.id, id))
      .returning();
    return alert || undefined;
  }

  // Call Campaigns
  async getCallCampaigns(): Promise<CallCampaign[]> {
    try {
      return await db.select().from(callCampaigns);
    } catch (error) {
      console.error('Database error fetching call campaigns:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async getCallCampaign(id: number): Promise<CallCampaign | undefined> {
    try {
      const [campaign] = await db.select().from(callCampaigns).where(eq(callCampaigns.id, id));
      return campaign || undefined;
    } catch (error) {
      console.error('Database error fetching call campaign:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async createCallCampaign(insertCampaign: InsertCallCampaign): Promise<CallCampaign> {
    const [campaign] = await db
      .insert(callCampaigns)
      .values(insertCampaign)
      .returning();
    return campaign;
  }

  async updateCallCampaign(id: number, updates: Partial<CallCampaign>): Promise<CallCampaign | undefined> {
    const [campaign] = await db
      .update(callCampaigns)
      .set(updates)
      .where(eq(callCampaigns.id, id))
      .returning();
    return campaign || undefined;
  }

  // Call Attempts
  async getCallAttempts(): Promise<CallAttempt[]> {
    try {
      return await db.select().from(callAttempts);
    } catch (error) {
      console.error('Database error fetching call attempts:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async getCallAttemptsByCampaign(campaignId: number): Promise<CallAttempt[]> {
    try {
      return await db.select().from(callAttempts).where(eq(callAttempts.campaignId, campaignId));
    } catch (error) {
      console.error('Database error fetching call attempts by campaign:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async getPendingCallAttempts(): Promise<CallAttempt[]> {
    try {
      return await db.select().from(callAttempts).where(eq(callAttempts.status, 'pending'));
    } catch (error) {
      console.error('Database error fetching pending call attempts:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async createCallAttempt(insertAttempt: InsertCallAttempt): Promise<CallAttempt> {
    const [attempt] = await db
      .insert(callAttempts)
      .values(insertAttempt)
      .returning();
    return attempt;
  }

  async updateCallAttempt(id: number, updates: Partial<CallAttempt>): Promise<CallAttempt | undefined> {
    const [attempt] = await db
      .update(callAttempts)
      .set(updates)
      .where(eq(callAttempts.id, id))
      .returning();
    return attempt || undefined;
  }

  // Messages
  async getMessagesByPatient(patientId: number): Promise<Message[]> {
    try {
      return await db.select().from(messages).where(eq(messages.patientId, patientId)).orderBy(messages.sentAt);
    } catch (error) {
      console.error('Database error fetching messages:', error);
      throw new Error('Database connection failed. Please try again.');
    }
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<Message | undefined> {
    const [message] = await db
      .update(messages)
      .set(updates)
      .where(eq(messages.id, id))
      .returning();
    return message || undefined;
  }
}

export const storage = new DatabaseStorage();
