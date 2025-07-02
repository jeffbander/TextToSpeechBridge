import { HumeClient } from 'hume';
import { storage } from '../storage';
import type { Patient, PatientDocument } from '@shared/schema';

export interface HumeCallSession {
  sessionId: string;
  patientId: number;
  callId: number;
  configId?: string;
  startTime: Date;
  isActive: boolean;
  transcript: string[];
  patientDocuments: PatientDocument[];
}

interface HumeEVIConfig {
  name: string;
  description: string;
  eviVersion: string;
  prompt: {
    text: string;
  };
  voice: {
    provider: string;
    name: string;
  };
  languageModel: {
    modelProvider: string;
    modelResource: string;
    temperature: number;
  };
}

export class HumeAIService {
  private client: HumeClient;
  private activeSessions: Map<string, HumeCallSession> = new Map();

  constructor() {
    if (!process.env.HUME_API_KEY) {
      throw new Error('HUME_API_KEY environment variable is required');
    }
    
    this.client = new HumeClient({
      apiKey: process.env.HUME_API_KEY,
    });
    
    console.log('[HUME-AI] Service initialized with API key');
  }

  /**
   * Create a patient-specific EVI configuration with their documents
   */
  async createPatientEVIConfig(patient: Patient, documents: PatientDocument[]): Promise<string> {
    try {
      // Build the patient-specific prompt with their documents
      const patientPrompt = this.buildPatientPrompt(patient, documents);
      
      const config = {
        name: `Patient_${patient.id}_Config`,
        description: `EVI configuration for ${patient.firstName} ${patient.lastName}`,
        eviVersion: "2",
        prompt: {
          text: patientPrompt
        },
        voice: {
          provider: "HUME_AI",
          name: "ITO" // Normal male voice
        },
        languageModel: {
          modelProvider: "ANTHROPIC",
          modelResource: "claude-3-5-sonnet-20241022",
          temperature: 0.3 // Lower temperature for more consistent, professional responses
        }
      };

      // Create the EVI configuration
      const response = await this.client.empathicVoice.configs.createConfig(config);
      
      console.log(`[HUME-AI] Created EVI config ${response.id} for patient ${patient.firstName} ${patient.lastName}`);
      return response.id!;
      
    } catch (error) {
      console.error('[HUME-AI] Error creating EVI config:', error);
      throw new Error('Failed to create patient EVI configuration');
    }
  }

  /**
   * Build patient-specific conversation prompt including their documents
   */
  private buildPatientPrompt(patient: Patient, documents: PatientDocument[]): string {
    let prompt = `You are a healthcare AI assistant conducting a follow-up call for ${patient.firstName} ${patient.lastName}.

PATIENT INFORMATION:
- Name: ${patient.firstName} ${patient.lastName}
- MRN: ${patient.mrn}
- Condition: ${patient.condition}
- Phone: ${patient.phoneNumber}
- DOB: ${patient.dateOfBirth}

IMPORTANT INSTRUCTIONS:
1. You are calling THIS SPECIFIC PATIENT ONLY - never share information about other patients
2. Verify the patient's identity at the start of the call by asking them to confirm their date of birth
3. Speak in a warm, professional, and caring tone
4. Use simple, everyday language that patients can understand
5. If the patient has questions you cannot answer, tell them to contact their healthcare provider
6. Keep responses concise and focused on their specific care needs

`;

    // Add patient documents if available
    if (documents.length > 0) {
      prompt += `PATIENT-SPECIFIC DOCUMENTS TO REFERENCE:\n\n`;
      
      documents.forEach((doc, index) => {
        prompt += `Document ${index + 1}: ${doc.title} (${doc.documentType})\n`;
        prompt += `${doc.content}\n\n`;
      });
      
      prompt += `DOCUMENT READING INSTRUCTIONS:
- Read relevant portions of the patient's documents when appropriate
- Always personalize the information to this specific patient
- If reading discharge instructions or medication lists, read them clearly and slowly
- Ask if the patient has questions about any information you've shared

`;
    }

    // Add custom prompt if patient has one
    if (patient.customPrompt) {
      prompt += `ADDITIONAL PATIENT-SPECIFIC INSTRUCTIONS:\n${patient.customPrompt}\n\n`;
    }

    prompt += `CONVERSATION FLOW:
1. Greet the patient warmly and introduce yourself
2. Verify their identity (date of birth)
3. Explain the purpose of the call (follow-up after their recent ${patient.condition} care)
4. Ask about their current symptoms, pain levels, and how they're feeling
5. Review any relevant documents or instructions they should know about
6. Ask about medication compliance if applicable
7. Address any questions or concerns they have
8. Provide next steps or remind them of upcoming appointments
9. Thank them and end the call professionally

Remember: This call is specifically for ${patient.firstName} ${patient.lastName} and their ${patient.condition} condition. Never reference other patients or share information not specific to them.`;

    return prompt;
  }

  /**
   * Start a new call session for a patient
   */
  async startCallSession(patientId: number, callId: number): Promise<string> {
    try {
      // Get patient and their documents
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        throw new Error(`Patient ${patientId} not found`);
      }

      const documents = await storage.getActivePatientDocuments(patientId);
      
      // Create patient-specific EVI configuration
      const configId = await this.createPatientEVIConfig(patient, documents);
      
      // Create session
      const sessionId = `hume_${Date.now()}_${patientId}`;
      
      const session: HumeCallSession = {
        sessionId,
        patientId,
        callId,
        configId,
        startTime: new Date(),
        isActive: true,
        transcript: [],
        patientDocuments: documents
      };

      this.activeSessions.set(sessionId, session);
      
      console.log(`[HUME-AI] Started call session ${sessionId} for patient ${patient.firstName} ${patient.lastName}`);
      return sessionId;
      
    } catch (error) {
      console.error('[HUME-AI] Error starting call session:', error);
      throw error;
    }
  }

  /**
   * Get active session by ID
   */
  getSession(sessionId: string): HumeCallSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Update session transcript
   */
  updateSessionTranscript(sessionId: string, text: string, speaker: 'user' | 'assistant'): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.transcript.push(`${speaker}: ${text}`);
    }
  }

  /**
   * End a call session and save results
   */
  async endCallSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      console.log(`[HUME-AI] Session ${sessionId} not found or already ended`);
      return;
    }

    try {
      session.isActive = false;
      
      // Save transcript to call record
      const transcript = session.transcript.join('\n');
      await storage.updateCall(session.callId, {
        transcript,
        status: 'completed',
        completedAt: new Date(),
        duration: Math.floor((new Date().getTime() - session.startTime.getTime()) / 1000)
      });

      // Clean up the session
      this.activeSessions.delete(sessionId);
      
      console.log(`[HUME-AI] Ended call session ${sessionId}, saved transcript`);
      
    } catch (error) {
      console.error(`[HUME-AI] Error ending session ${sessionId}:`, error);
    }
  }

  /**
   * Get Hume access token for WebSocket connections
   */
  async getAccessToken(): Promise<string> {
    try {
      // For now, return the API key directly as access token
      // In production, this would be replaced with proper token exchange
      return process.env.HUME_API_KEY!;
    } catch (error) {
      console.error('[HUME-AI] Error getting access token:', error);
      throw new Error('Failed to get Hume access token');
    }
  }

  /**
   * Generate TwiML for connecting Twilio call to Hume EVI
   */
  getTwiMLForPatient(sessionId: string, baseUrl: string): string {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="wss://${baseUrl.replace('https://', '')}/hume-evi-stream/${sessionId}" />
    </Connect>
</Response>`;
  }

  /**
   * Handle cleanup of inactive sessions
   */
  cleanup(): void {
    const now = Date.now();
    const maxSessionAge = 30 * 60 * 1000; // 30 minutes

    // Convert to array to avoid iterator issues
    const sessions = Array.from(this.activeSessions.entries());
    for (const [sessionId, session] of sessions) {
      if (now - session.startTime.getTime() > maxSessionAge) {
        console.log(`[HUME-AI] Cleaning up inactive session ${sessionId}`);
        this.endCallSession(sessionId);
      }
    }
  }
}

export const humeAIService = new HumeAIService();

// Cleanup inactive sessions every 5 minutes
setInterval(() => {
  humeAIService.cleanup();
}, 5 * 60 * 1000);