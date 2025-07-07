/**
 * Core interfaces for the CardioCare AI system
 * Defines the contract for AI services and call providers
 */

export interface AIServiceConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  voiceId?: string;
}

export interface CallProviderConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  webhookUrl?: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  title: string;
  content: string;
  type: 'medical_record' | 'discharge_instructions' | 'medication_list' | 'care_plan' | 'notes';
  createdAt: Date;
  updatedAt: Date;
}

export interface CallSession {
  id: string;
  patientId: string;
  phoneNumber: string;
  status: 'initiating' | 'ringing' | 'connected' | 'in_progress' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  transcript?: string;
  aiAnalysis?: string;
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ConversationContext {
  patientId: string;
  patientName: string;
  medicalCondition: string;
  riskLevel: 'low' | 'medium' | 'high';
  documents: PatientDocument[];
  customPrompt?: string;
  previousCalls?: CallSession[];
}

/**
 * Interface for AI service providers (OpenAI, Hume AI, etc.)
 */
export interface IAIService {
  initialize(config: AIServiceConfig): Promise<void>;
  generatePrompt(context: ConversationContext): Promise<string>;
  startConversation(context: ConversationContext): Promise<string>;
  processAudioStream(audioData: Buffer, sessionId: string): Promise<Buffer>;
  analyzeConversation(transcript: string, context: ConversationContext): Promise<{
    summary: string;
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
    followUpRequired: boolean;
  }>;
  endConversation(sessionId: string): Promise<void>;
  isAvailable(): boolean;
}

/**
 * Interface for call providers (Twilio, etc.)
 */
export interface ICallProvider {
  initialize(config: CallProviderConfig): Promise<void>;
  initiateCall(phoneNumber: string, callbackUrl: string): Promise<string>;
  handleIncomingCall(callSid: string, from: string): Promise<void>;
  streamAudio(callSid: string, audioData: Buffer): Promise<void>;
  endCall(callSid: string): Promise<void>;
  getCallStatus(callSid: string): Promise<string>;
  isAvailable(): boolean;
}

/**
 * Interface for the main call orchestration service
 */
export interface ICallOrchestrator {
  startPatientCall(patientId: string, phoneNumber: string): Promise<CallSession>;
  handleCallUpdate(callSid: string, status: string): Promise<void>;
  processAudioStream(callSid: string, audioData: Buffer): Promise<void>;
  endCall(callSid: string): Promise<CallSession>;
  getActiveCall(callSid: string): Promise<CallSession | null>;
  getPatientContext(patientId: string): Promise<ConversationContext>;
}

/**
 * Interface for patient document management
 */
export interface IDocumentManager {
  addDocument(patientId: string, document: Omit<PatientDocument, 'id' | 'createdAt' | 'updatedAt'>): Promise<PatientDocument>;
  getPatientDocuments(patientId: string): Promise<PatientDocument[]>;
  updateDocument(documentId: string, updates: Partial<PatientDocument>): Promise<PatientDocument>;
  deleteDocument(documentId: string): Promise<void>;
  searchDocuments(patientId: string, query: string): Promise<PatientDocument[]>;
}

/**
 * Event types for the system
 */
export type SystemEvent = 
  | { type: 'call_started'; payload: { callSid: string; patientId: string } }
  | { type: 'call_connected'; payload: { callSid: string } }
  | { type: 'call_ended'; payload: { callSid: string; duration: number } }
  | { type: 'urgent_alert'; payload: { patientId: string; urgencyLevel: string; message: string } }
  | { type: 'ai_analysis_complete'; payload: { callSid: string; analysis: any } }
  | { type: 'error'; payload: { error: string; context?: any } };

/**
 * Event handler interface
 */
export interface IEventHandler {
  handleEvent(event: SystemEvent): Promise<void>;
}