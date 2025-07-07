/**
 * Twilio Call Provider Implementation
 * Handles phone call initiation, management, and audio streaming
 */

import twilio from 'twilio';
import { ICallProvider, CallProviderConfig } from '../interfaces';
import { Logger } from '../../utils/logger';

export class TwilioCallProvider implements ICallProvider {
  private client: twilio.Twilio | null = null;
  private config: CallProviderConfig | null = null;
  private activeCalls: Map<string, any> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('TwilioCallProvider');
  }

  async initialize(config: CallProviderConfig): Promise<void> {
    try {
      if (!config.accountSid || !config.authToken || !config.phoneNumber) {
        throw new Error('Twilio credentials are required: accountSid, authToken, phoneNumber');
      }

      this.client = twilio(config.accountSid, config.authToken);
      this.config = config;

      // Test connection
      await this.client.api.accounts(config.accountSid).fetch();
      
      this.logger.info('Twilio call provider initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Twilio call provider:', error);
      throw error;
    }
  }

  async initiateCall(phoneNumber: string, callbackUrl: string): Promise<string> {
    try {
      if (!this.client || !this.config) {
        throw new Error('Twilio client not initialized');
      }

      const call = await this.client.calls.create({
        to: phoneNumber,
        from: this.config.phoneNumber,
        url: callbackUrl,
        statusCallback: `${callbackUrl}/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        record: false, // We'll handle recording through our audio streaming
        timeout: 30, // 30 second timeout
      });

      this.activeCalls.set(call.sid, {
        callSid: call.sid,
        to: phoneNumber,
        from: this.config.phoneNumber,
        status: call.status,
        startTime: new Date(),
      });

      this.logger.info(`Initiated call ${call.sid} to ${phoneNumber}`);
      return call.sid;
    } catch (error) {
      this.logger.error('Failed to initiate call:', error);
      throw error;
    }
  }

  async handleIncomingCall(callSid: string, from: string): Promise<void> {
    try {
      this.logger.info(`Handling incoming call ${callSid} from ${from}`);
      
      this.activeCalls.set(callSid, {
        callSid,
        from,
        to: this.config?.phoneNumber,
        status: 'ringing',
        startTime: new Date(),
        incoming: true,
      });

    } catch (error) {
      this.logger.error('Failed to handle incoming call:', error);
      throw error;
    }
  }

  async streamAudio(callSid: string, audioData: Buffer): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // For Twilio, audio streaming is handled through WebSocket connections
      // This method would be used for additional processing if needed
      this.logger.debug(`Streaming audio for call ${callSid}`);
      
      const callInfo = this.activeCalls.get(callSid);
      if (callInfo) {
        callInfo.lastActivity = new Date();
      }

    } catch (error) {
      this.logger.error('Failed to stream audio:', error);
      throw error;
    }
  }

  async endCall(callSid: string): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      await this.client.calls(callSid).update({ status: 'completed' });
      
      const callInfo = this.activeCalls.get(callSid);
      if (callInfo) {
        callInfo.endTime = new Date();
        callInfo.status = 'completed';
      }

      this.logger.info(`Ended call ${callSid}`);
    } catch (error) {
      this.logger.error('Failed to end call:', error);
      throw error;
    }
  }

  async getCallStatus(callSid: string): Promise<string> {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const call = await this.client.calls(callSid).fetch();
      
      // Update local cache
      const callInfo = this.activeCalls.get(callSid);
      if (callInfo) {
        callInfo.status = call.status;
        callInfo.duration = call.duration;
      }

      return call.status;
    } catch (error) {
      this.logger.error('Failed to get call status:', error);
      throw error;
    }
  }

  isAvailable(): boolean {
    return this.client !== null && this.config !== null;
  }

  // Additional Twilio-specific methods
  
  /**
   * Generate TwiML response for call handling
   */
  generateTwiMLResponse(websocketUrl: string, greeting?: string): string {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greeting ? `<Say voice="man">${greeting}</Say>` : ''}
  <Connect>
    <Stream url="${websocketUrl}" />
  </Connect>
</Response>`;

    return twiml;
  }

  /**
   * Generate TwiML for bidirectional audio streaming
   */
  generateBidirectionalTwiML(websocketUrl: string): string {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="man">Hello! I'm your healthcare assistant. How are you feeling today?</Say>
  <Connect>
    <Stream url="${websocketUrl}">
      <Parameter name="asr" value="true" />
      <Parameter name="interim_results" value="true" />
    </Stream>
  </Connect>
</Response>`;

    return twiml;
  }

  /**
   * Get active call information
   */
  getActiveCall(callSid: string): any {
    return this.activeCalls.get(callSid);
  }

  /**
   * Get all active calls
   */
  getAllActiveCalls(): Map<string, any> {
    return this.activeCalls;
  }

  /**
   * Clean up completed calls
   */
  cleanupCompletedCalls(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    for (const [callSid, callInfo] of this.activeCalls.entries()) {
      if (callInfo.status === 'completed' && callInfo.endTime && callInfo.endTime < oneHourAgo) {
        this.activeCalls.delete(callSid);
        this.logger.debug(`Cleaned up completed call ${callSid}`);
      }
    }
  }

  /**
   * Handle call status updates from Twilio webhooks
   */
  handleStatusUpdate(callSid: string, status: string, duration?: number): void {
    const callInfo = this.activeCalls.get(callSid);
    if (callInfo) {
      callInfo.status = status;
      callInfo.lastUpdate = new Date();
      
      if (duration) {
        callInfo.duration = duration;
      }
      
      if (status === 'completed') {
        callInfo.endTime = new Date();
      }
      
      this.logger.info(`Updated call ${callSid} status to ${status}`);
    }
  }

  /**
   * Get call duration in seconds
   */
  getCallDuration(callSid: string): number {
    const callInfo = this.activeCalls.get(callSid);
    if (!callInfo || !callInfo.startTime) return 0;
    
    const endTime = callInfo.endTime || new Date();
    return Math.floor((endTime.getTime() - callInfo.startTime.getTime()) / 1000);
  }
}