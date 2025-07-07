/**
 * Call Orchestration Service
 * Manages the coordination between AI services and call providers
 */

import { 
  ICallOrchestrator, 
  IAIService, 
  ICallProvider, 
  CallSession, 
  ConversationContext,
  SystemEvent,
  IEventHandler,
  IDocumentManager
} from '../interfaces';
import { Logger } from '../../utils/logger';
import { nanoid } from 'nanoid';

export class CallOrchestrator implements ICallOrchestrator {
  private aiService: IAIService;
  private callProvider: ICallProvider;
  private documentManager: IDocumentManager;
  private eventHandlers: IEventHandler[] = [];
  private activeCalls: Map<string, CallSession> = new Map();
  private callSidToSessionMap: Map<string, string> = new Map();
  private logger: Logger;

  constructor(
    aiService: IAIService,
    callProvider: ICallProvider,
    documentManager: IDocumentManager
  ) {
    this.aiService = aiService;
    this.callProvider = callProvider;
    this.documentManager = documentManager;
    this.logger = new Logger('CallOrchestrator');
  }

  /**
   * Add event handler for system events
   */
  addEventHandler(handler: IEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit system event to all handlers
   */
  private async emitEvent(event: SystemEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler.handleEvent(event);
      } catch (error) {
        this.logger.error('Event handler error:', error);
      }
    }
  }

  async startPatientCall(patientId: string, phoneNumber: string): Promise<CallSession> {
    try {
      // Check if services are available
      if (!this.aiService.isAvailable()) {
        throw new Error('AI service is not available');
      }
      
      if (!this.callProvider.isAvailable()) {
        throw new Error('Call provider is not available');
      }

      // Create call session
      const sessionId = nanoid();
      const callSession: CallSession = {
        id: sessionId,
        patientId,
        phoneNumber,
        status: 'initiating',
        startTime: new Date(),
      };

      this.activeCalls.set(sessionId, callSession);
      
      // Get patient context
      const context = await this.getPatientContext(patientId);
      
      // Start AI conversation
      const configId = await this.aiService.startConversation(context);
      
      // Generate callback URL for Twilio
      const callbackUrl = `${process.env.WEBHOOK_BASE_URL || 'https://your-app.replit.app'}/api/twilio/webhook`;
      
      // Initiate call
      const callSid = await this.callProvider.initiateCall(phoneNumber, callbackUrl);
      
      // Map call SID to session
      this.callSidToSessionMap.set(callSid, sessionId);
      
      // Update call session
      callSession.status = 'ringing';
      
      // Emit event
      await this.emitEvent({
        type: 'call_started',
        payload: { callSid, patientId }
      });

      this.logger.info(`Started call for patient ${patientId} with session ${sessionId}`);
      
      return callSession;
    } catch (error) {
      this.logger.error('Failed to start patient call:', error);
      
      await this.emitEvent({
        type: 'error',
        payload: { error: error.message, context: { patientId, phoneNumber } }
      });
      
      throw error;
    }
  }

  async handleCallUpdate(callSid: string, status: string): Promise<void> {
    try {
      const sessionId = this.callSidToSessionMap.get(callSid);
      if (!sessionId) {
        this.logger.warn(`No session found for call SID ${callSid}`);
        return;
      }

      const callSession = this.activeCalls.get(sessionId);
      if (!callSession) {
        this.logger.warn(`No call session found for session ID ${sessionId}`);
        return;
      }

      // Update call status
      callSession.status = this.mapTwilioStatus(status);
      
      // Handle specific status updates
      switch (status) {
        case 'in-progress':
          await this.emitEvent({
            type: 'call_connected',
            payload: { callSid }
          });
          break;
          
        case 'completed':
        case 'failed':
        case 'canceled':
          callSession.endTime = new Date();
          await this.handleCallEnd(callSid);
          break;
      }

      this.logger.info(`Updated call ${callSid} status to ${status}`);
    } catch (error) {
      this.logger.error('Failed to handle call update:', error);
      
      await this.emitEvent({
        type: 'error',
        payload: { error: error.message, context: { callSid, status } }
      });
    }
  }

  async processAudioStream(callSid: string, audioData: Buffer): Promise<void> {
    try {
      const sessionId = this.callSidToSessionMap.get(callSid);
      if (!sessionId) {
        this.logger.warn(`No session found for call SID ${callSid}`);
        return;
      }

      // Process audio through AI service
      const processedAudio = await this.aiService.processAudioStream(audioData, sessionId);
      
      // Stream processed audio back through call provider
      await this.callProvider.streamAudio(callSid, processedAudio);
      
    } catch (error) {
      this.logger.error('Failed to process audio stream:', error);
    }
  }

  async endCall(callSid: string): Promise<CallSession> {
    try {
      const sessionId = this.callSidToSessionMap.get(callSid);
      if (!sessionId) {
        throw new Error(`No session found for call SID ${callSid}`);
      }

      const callSession = this.activeCalls.get(sessionId);
      if (!callSession) {
        throw new Error(`No call session found for session ID ${sessionId}`);
      }

      // End call with provider
      await this.callProvider.endCall(callSid);
      
      // End AI conversation
      await this.aiService.endConversation(sessionId);
      
      // Update session
      callSession.status = 'completed';
      callSession.endTime = new Date();
      
      // Analyze conversation if transcript exists
      if (callSession.transcript) {
        const context = await this.getPatientContext(callSession.patientId);
        const analysis = await this.aiService.analyzeConversation(callSession.transcript, context);
        
        callSession.aiAnalysis = JSON.stringify(analysis);
        callSession.urgencyLevel = analysis.urgencyLevel;
        
        // Handle urgent cases
        if (analysis.urgencyLevel === 'high' || analysis.urgencyLevel === 'critical') {
          await this.emitEvent({
            type: 'urgent_alert',
            payload: {
              patientId: callSession.patientId,
              urgencyLevel: analysis.urgencyLevel,
              message: analysis.summary
            }
          });
        }
        
        await this.emitEvent({
          type: 'ai_analysis_complete',
          payload: { callSid, analysis }
        });
      }

      // Calculate duration
      const duration = callSession.endTime.getTime() - callSession.startTime!.getTime();
      
      await this.emitEvent({
        type: 'call_ended',
        payload: { callSid, duration: Math.floor(duration / 1000) }
      });

      // Clean up
      this.callSidToSessionMap.delete(callSid);
      
      this.logger.info(`Ended call ${callSid} for session ${sessionId}`);
      
      return callSession;
    } catch (error) {
      this.logger.error('Failed to end call:', error);
      throw error;
    }
  }

  async getActiveCall(callSid: string): Promise<CallSession | null> {
    const sessionId = this.callSidToSessionMap.get(callSid);
    if (!sessionId) return null;
    
    return this.activeCalls.get(sessionId) || null;
  }

  async getPatientContext(patientId: string): Promise<ConversationContext> {
    try {
      // This would typically fetch from your database
      // For now, we'll return a basic context structure
      const documents = await this.documentManager.getPatientDocuments(patientId);
      
      // In a real implementation, you'd fetch patient data from database
      const context: ConversationContext = {
        patientId,
        patientName: 'Patient', // Would be fetched from database
        medicalCondition: 'General Follow-up', // Would be fetched from database
        riskLevel: 'medium', // Would be fetched from database
        documents,
        previousCalls: [], // Would be fetched from database
      };

      return context;
    } catch (error) {
      this.logger.error('Failed to get patient context:', error);
      throw error;
    }
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): CallSession[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get call session by ID
   */
  getCallSession(sessionId: string): CallSession | undefined {
    return this.activeCalls.get(sessionId);
  }

  /**
   * Clean up completed calls
   */
  cleanupCompletedCalls(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    for (const [sessionId, callSession] of this.activeCalls.entries()) {
      if (callSession.status === 'completed' && callSession.endTime && callSession.endTime < oneHourAgo) {
        this.activeCalls.delete(sessionId);
        this.logger.debug(`Cleaned up completed call session ${sessionId}`);
      }
    }
  }

  /**
   * Handle call end logic
   */
  private async handleCallEnd(callSid: string): Promise<void> {
    const sessionId = this.callSidToSessionMap.get(callSid);
    if (!sessionId) return;

    const callSession = this.activeCalls.get(sessionId);
    if (!callSession) return;

    // End AI conversation
    await this.aiService.endConversation(sessionId);
    
    // Additional cleanup logic here
  }

  /**
   * Map Twilio call status to our internal status
   */
  private mapTwilioStatus(twilioStatus: string): CallSession['status'] {
    switch (twilioStatus) {
      case 'queued':
      case 'ringing':
        return 'ringing';
      case 'in-progress':
        return 'in_progress';
      case 'completed':
        return 'completed';
      case 'failed':
      case 'canceled':
      case 'busy':
      case 'no-answer':
        return 'failed';
      default:
        return 'failed';
    }
  }
}