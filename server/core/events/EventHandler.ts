/**
 * System Event Handler
 * Handles system-wide events like alerts, notifications, and logging
 */

import { IEventHandler, SystemEvent } from '../interfaces';
import { Logger } from '../../utils/logger';

export class SystemEventHandler implements IEventHandler {
  private logger: Logger;
  private alertHandlers: Map<string, (event: SystemEvent) => Promise<void>> = new Map();

  constructor() {
    this.logger = new Logger('SystemEventHandler');
    this.setupDefaultHandlers();
  }

  async handleEvent(event: SystemEvent): Promise<void> {
    try {
      this.logger.info(`Handling event: ${event.type}`, event.payload);

      switch (event.type) {
        case 'call_started':
          await this.handleCallStarted(event);
          break;

        case 'call_connected':
          await this.handleCallConnected(event);
          break;

        case 'call_ended':
          await this.handleCallEnded(event);
          break;

        case 'urgent_alert':
          await this.handleUrgentAlert(event);
          break;

        case 'ai_analysis_complete':
          await this.handleAIAnalysisComplete(event);
          break;

        case 'error':
          await this.handleError(event);
          break;

        default:
          this.logger.warn(`Unknown event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Failed to handle event:', error);
    }
  }

  private async handleCallStarted(event: SystemEvent): Promise<void> {
    if (event.type !== 'call_started') return;
    
    const { callSid, patientId } = event.payload;
    this.logger.info(`Call started: ${callSid} for patient ${patientId}`);
    
    // Additional logic for call start (notifications, logging, etc.)
  }

  private async handleCallConnected(event: SystemEvent): Promise<void> {
    if (event.type !== 'call_connected') return;
    
    const { callSid } = event.payload;
    this.logger.info(`Call connected: ${callSid}`);
    
    // Additional logic for call connection
  }

  private async handleCallEnded(event: SystemEvent): Promise<void> {
    if (event.type !== 'call_ended') return;
    
    const { callSid, duration } = event.payload;
    this.logger.info(`Call ended: ${callSid}, duration: ${duration}s`);
    
    // Additional logic for call end (save to database, generate reports, etc.)
  }

  private async handleUrgentAlert(event: SystemEvent): Promise<void> {
    if (event.type !== 'urgent_alert') return;
    
    const { patientId, urgencyLevel, message } = event.payload;
    this.logger.warn(`URGENT ALERT - Patient ${patientId} (${urgencyLevel}): ${message}`);
    
    // Send notifications to healthcare providers
    await this.sendUrgentNotification(patientId, urgencyLevel, message);
  }

  private async handleAIAnalysisComplete(event: SystemEvent): Promise<void> {
    if (event.type !== 'ai_analysis_complete') return;
    
    const { callSid, analysis } = event.payload;
    this.logger.info(`AI analysis complete for call ${callSid}`);
    
    // Process analysis results (save to database, trigger workflows, etc.)
  }

  private async handleError(event: SystemEvent): Promise<void> {
    if (event.type !== 'error') return;
    
    const { error, context } = event.payload;
    this.logger.error(`System error: ${error}`, context);
    
    // Error handling logic (alerts, recovery, etc.)
  }

  private async sendUrgentNotification(patientId: string, urgencyLevel: string, message: string): Promise<void> {
    try {
      // This would integrate with your notification system (email, SMS, etc.)
      this.logger.info(`Sending urgent notification for patient ${patientId}: ${urgencyLevel} - ${message}`);
      
      // Example: Send email alert
      // await this.emailService.sendUrgentAlert({
      //   patientId,
      //   urgencyLevel,
      //   message,
      //   timestamp: new Date()
      // });
      
    } catch (error) {
      this.logger.error('Failed to send urgent notification:', error);
    }
  }

  private setupDefaultHandlers(): void {
    // Setup any default event handlers
    this.logger.info('System event handler initialized');
  }

  /**
   * Register custom alert handler
   */
  registerAlertHandler(eventType: string, handler: (event: SystemEvent) => Promise<void>): void {
    this.alertHandlers.set(eventType, handler);
    this.logger.info(`Registered custom alert handler for ${eventType}`);
  }

  /**
   * Get system health status
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastActivity: Date;
    eventCount: number;
  } {
    return {
      status: 'healthy',
      lastActivity: new Date(),
      eventCount: 0, // This would track actual event counts
    };
  }
}