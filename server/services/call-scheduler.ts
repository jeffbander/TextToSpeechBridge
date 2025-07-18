import { storage } from '../storage';
import { CallAttempt, Patient } from '@shared/schema';
import twilio from 'twilio';
import { triggerAutomationForPatient } from './aigents-integration';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export class CallSchedulerService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.startScheduler();
  }

  startScheduler() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('[CALL-SCHEDULER] Starting automated call scheduler');
    
    // Check for scheduled calls every 30 seconds
    this.schedulerInterval = setInterval(() => {
      this.processScheduledCalls().catch(error => {
        console.error('[CALL-SCHEDULER] Error processing scheduled calls:', error);
      });
    }, 30000);
  }

  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    this.isRunning = false;
    console.log('[CALL-SCHEDULER] Call scheduler stopped');
  }

  async processScheduledCalls() {
    try {
      // Get all pending and scheduled retry attempts
      const allAttempts = await storage.getCallAttempts();
      const now = new Date();
      
      const readyAttempts = allAttempts.filter(attempt => 
        (attempt.status === 'pending' || attempt.status === 'scheduled_retry') &&
        (!attempt.scheduledAt || new Date(attempt.scheduledAt) <= now)
      );

      if (readyAttempts.length > 0) {
        console.log(`[CALL-SCHEDULER] Found ${readyAttempts.length} calls ready to process`);
      }

      // Filter CSV-imported calls for business hours restriction
      const csvAttempts = [];
      const manualAttempts = [];

      for (const attempt of readyAttempts) {
        const isCSVImported = attempt.metadata && 
          (typeof attempt.metadata === 'object') && 
          'batchId' in attempt.metadata;
        
        if (isCSVImported) {
          csvAttempts.push(attempt);
        } else {
          manualAttempts.push(attempt);
        }
      }

      // Process manual calls anytime
      for (const attempt of manualAttempts) {
        await this.initiateCall(attempt);
      }

      // Process CSV-imported calls (business hours restriction temporarily disabled)
      if (csvAttempts.length > 0) {
        console.log(`[CALL-SCHEDULER] Processing ${csvAttempts.length} CSV-imported calls (business hours restriction disabled)`);
        for (const attempt of csvAttempts) {
          await this.initiateCall(attempt);
        }
      }
    } catch (error) {
      console.error('[CALL-SCHEDULER] Error in processScheduledCalls:', error);
    }
  }

  private isWithinBusinessHours(): boolean {
    const now = new Date();
    
    // Convert current time to Eastern Time
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hour = easternTime.getHours();
    const day = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if it's a weekday (Monday-Friday) and within business hours (9 AM - 8 PM)
    const isWeekday = day >= 1 && day <= 5;
    const isBusinessHour = hour >= 9 && hour < 20; // 9 AM to 8 PM (20:00 in 24-hour format)
    
    console.log(`[CALL-SCHEDULER] Current Eastern time: ${easternTime.toLocaleString()}, Day: ${day}, Hour: ${hour}, Weekday: ${isWeekday}, Business Hour: ${isBusinessHour}`);
    
    return isWeekday && isBusinessHour;
  }

  async initiateCall(attempt: CallAttempt) {
    try {
      console.log(`[CALL-SCHEDULER] Initiating call for attempt ${attempt.id}, patient ${attempt.patientId}`);
      
      // Update attempt status to in_progress
      await storage.updateCallAttempt(attempt.id, {
        status: 'in_progress',
        startedAt: new Date(),
      });

      // Get patient information
      const patient = await storage.getPatient(attempt.patientId);
      if (!patient) {
        throw new Error(`Patient ${attempt.patientId} not found`);
      }

      // Create call record
      const call = await storage.createCall({
        patientId: patient.id,
        status: 'active',
        callType: 'automated_gpt4o',
        customPrompt: this.buildCustomPrompt(patient),
      });

      // Update attempt with call ID
      await storage.updateCallAttempt(attempt.id, {
        callId: call.id,
      });

      // Generate session ID for voice pipeline
      const sessionId = `voice_${call.id}_${Date.now()}`;
      
      // Get the proper webhook URL - clean the domain name
      const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim();
      const cleanDomain = baseUrl?.replace(/^https?:\/\//, ''); // Remove protocol if present
      const webhookUrl = cleanDomain ? `https://${cleanDomain}/api/twilio/voice-pipeline/${sessionId}` : `http://localhost:5000/api/twilio/voice-pipeline/${sessionId}`;
      const statusCallbackUrl = cleanDomain ? `https://${cleanDomain}/api/twilio/voice-pipeline-status/${call.id}` : `http://localhost:5000/api/twilio/voice-pipeline-status/${call.id}`;
      
      console.log(`[CALL-SCHEDULER] Using webhook URL: ${webhookUrl}`);
      console.log(`[CALL-SCHEDULER] Using status callback URL: ${statusCallbackUrl}`);

      // Initiate Twilio call
      const twilioCall = await client.calls.create({
        to: attempt.phoneNumberUsed,
        from: process.env.TWILIO_PHONE_NUMBER!,
        url: webhookUrl,
        method: 'POST',
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        timeout: 30,
        record: true,
      });

      // Update call with Twilio SID
      await storage.updateCall(call.id, {
        twilioCallSid: twilioCall.sid,
      });

      console.log(`[CALL-SCHEDULER] Call initiated successfully: ${twilioCall.sid}`);

    } catch (error) {
      console.error(`[CALL-SCHEDULER] Failed to initiate call for attempt ${attempt.id}:`, error);
      
      // Handle call failure
      await this.handleCallFailure(attempt, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async handleCallFailure(attempt: CallAttempt, reason: string) {
    const campaign = await storage.getCallCampaign(attempt.campaignId);
    if (!campaign) return;

    const maxRetries = campaign.maxRetries || 3;
    const retryIntervalHours = campaign.retryIntervalHours || 1;

    if (attempt.attemptNumber >= maxRetries) {
      // Max retries reached, mark as failed
      await storage.updateCallAttempt(attempt.id, {
        status: 'failed',
        completedAt: new Date(),
        failureReason: `${reason} (Max retries ${maxRetries} reached)`,
      });

      // Update campaign failed calls count
      await storage.updateCallCampaign(campaign.id, {
        failedCalls: (campaign.failedCalls || 0) + 1,
      });

      console.log(`[CALL-SCHEDULER] Call attempt ${attempt.id} failed permanently after ${maxRetries} attempts`);
    } else {
      // Check if this is a CSV-imported call for business hours scheduling
      const isCSVImported = attempt.metadata && 
        (typeof attempt.metadata === 'object') && 
        'batchId' in attempt.metadata;
      
      // Schedule retry - use business hours only for CSV imports
      const nextRetryTime = isCSVImported 
        ? this.getNextBusinessHourRetry(retryIntervalHours)
        : new Date(Date.now() + (retryIntervalHours * 60 * 60 * 1000));
      
      // Create new attempt for retry
      await storage.createCallAttempt({
        campaignId: attempt.campaignId,
        patientId: attempt.patientId,
        attemptNumber: attempt.attemptNumber + 1,
        status: 'scheduled_retry',
        phoneNumberUsed: attempt.phoneNumberUsed,
        scheduledAt: nextRetryTime,
        nextRetryAt: nextRetryTime,
        metadata: {
          ...(attempt.metadata as any || {}),
          previousAttemptId: attempt.id,
          previousFailureReason: reason,
        },
      });

      // Mark current attempt as failed with retry scheduled
      await storage.updateCallAttempt(attempt.id, {
        status: 'failed',
        completedAt: new Date(),
        failureReason: reason,
        nextRetryAt: nextRetryTime,
      });

      const scheduleType = isCSVImported ? '(CSV - business hours)' : '(manual)';
      console.log(`[CALL-SCHEDULER] Call attempt ${attempt.id} failed, retry ${attempt.attemptNumber + 1} scheduled for ${nextRetryTime.toISOString()} ${scheduleType}`);
    }
  }

  private getNextBusinessHourRetry(intervalHours: number): Date {
    let nextRetry = new Date(Date.now() + (intervalHours * 60 * 60 * 1000));
    
    // Convert to Eastern Time to check business hours
    let easternTime = new Date(nextRetry.toLocaleString("en-US", {timeZone: "America/New_York"}));
    let hour = easternTime.getHours();
    let day = easternTime.getDay();
    
    // If outside business hours, move to next business day at 9 AM Eastern
    while (day === 0 || day === 6 || hour < 9 || hour >= 20) {
      if (day === 0 || day === 6) {
        // Weekend - move to Monday 9 AM
        const daysToMonday = day === 0 ? 1 : 2; // Sunday=1 day, Saturday=2 days
        nextRetry = new Date(nextRetry);
        nextRetry.setDate(nextRetry.getDate() + daysToMonday);
        nextRetry.setHours(9, 0, 0, 0); // 9 AM Eastern
      } else if (hour < 9) {
        // Before 9 AM - set to 9 AM same day
        nextRetry.setHours(9, 0, 0, 0);
      } else if (hour >= 20) {
        // After 8 PM - move to next day 9 AM
        nextRetry.setDate(nextRetry.getDate() + 1);
        nextRetry.setHours(9, 0, 0, 0);
      }
      
      // Recalculate Eastern time
      easternTime = new Date(nextRetry.toLocaleString("en-US", {timeZone: "America/New_York"}));
      hour = easternTime.getHours();
      day = easternTime.getDay();
    }
    
    return nextRetry;
  }

  async handleCallSuccess(attempt: CallAttempt, callId: number) {
    // Mark attempt as completed
    await storage.updateCallAttempt(attempt.id, {
      status: 'completed',
      completedAt: new Date(),
    });

    // Update campaign stats
    const campaign = await storage.getCallCampaign(attempt.campaignId);
    if (campaign) {
      await storage.updateCallCampaign(campaign.id, {
        completedCalls: (campaign.completedCalls || 0) + 1,
        successfulCalls: (campaign.successfulCalls || 0) + 1,
      });
    }

    console.log(`[CALL-SCHEDULER] Call attempt ${attempt.id} completed successfully`);

    // Trigger post call analysis automation
    await this.triggerPostCallAnalysis(attempt, callId);
  }

  async triggerPostCallAnalysis(attempt: CallAttempt, callId: number) {
    try {
      // Get patient and call data
      const patient = await storage.getPatient(attempt.patientId);
      const call = await storage.getCall(callId);
      
      if (!patient || !call) {
        console.log(`[POST-CALL-ANALYSIS] Missing data - Patient: ${!!patient}, Call: ${!!call}`);
        return;
      }

      // Generate source ID for AIGENTS system
      const generateSourceId = (firstName: string, lastName: string, dob: string) => {
        if (!firstName || !lastName || !dob) return '';
        
        const formattedFirstName = firstName.trim().replace(/\s+/g, '_');
        const formattedLastName = lastName.trim().replace(/\s+/g, '_');
        
        // Convert YYYY-MM-DD to MM_DD_YYYY
        const dobFormatted = dob.split('-').length === 3 
          ? `${dob.split('-')[1]}_${dob.split('-')[2]}_${dob.split('-')[0]}`
          : dob.replace(/\//g, '_');
        
        return `${formattedLastName}_${formattedFirstName}__${dobFormatted}`;
      };

      const sourceId = generateSourceId(patient.firstName, patient.lastName, patient.dateOfBirth);

      // Prepare call logs and data for analysis
      const callData = {
        call_id: call.id,
        patient_name: `${patient.firstName} ${patient.lastName}`,
        patient_mrn: patient.mrn,
        call_duration: call.duration || 0,
        call_status: call.status,
        call_outcome: call.outcome || 'completed',
        transcript: call.transcript || 'No transcript available',
        ai_analysis: call.aiAnalysis || {},
        alert_level: call.alertLevel || 'none',
        completion_time: call.completedAt?.toISOString() || new Date().toISOString(),
        patient_condition: patient.condition,
        risk_level: patient.riskLevel
      };

      console.log(`[POST-CALL-ANALYSIS] Triggering automation for patient ${patient.firstName} ${patient.lastName} with source ID: ${sourceId}`);

      // Trigger the "post call analysis" chain in AIGENTS
      const result = await triggerAutomationForPatient(
        patient,
        "post call analysis",
        JSON.stringify(callData),
        {
          call_logs: callData,
          source_id: sourceId,
          trigger_type: "automatic_post_call"
        }
      );

      // Log the automation trigger
      if (storage.createAutomationLog) {
        // Only create log if we got a valid chain run ID from AIGENTS
        if (result.chainRunId) {
          await storage.createAutomationLog({
            patientId: patient.id,
            chainRunId: result.chainRunId,
            chainToRun: "post call analysis",
            status: result.success ? 'triggered' : 'failed',
            triggerType: 'automatic_post_call',
            sourceId: sourceId,
            callId: callId,
            response: result,
            metadata: {
              call_data: callData,
              automation_result: result
            }
          });
        } else {
          console.log(`[POST-CALL-ANALYSIS] No chain run ID received from AIGENTS, skipping log creation`);
        }
      }

      console.log(`[POST-CALL-ANALYSIS] Automation ${result.success ? 'triggered successfully' : 'failed'} for call ${callId}`);

    } catch (error) {
      console.error(`[POST-CALL-ANALYSIS] Error triggering automation for call ${callId}:`, error);
      
      // Log the failure
      if (storage.createAutomationLog) {
        await storage.createAutomationLog({
          patientId: attempt.patientId,
          chainRunId: `post-call-error-${Date.now()}`,
          chainToRun: "post call analysis",
          status: 'error',
          triggerType: 'automatic_post_call',
          callId: callId,
          response: { error: (error as any).message || 'Unknown error' },
          metadata: {
            error_details: error,
            attempt_id: attempt.id
          }
        });
      }
    }
  }

  private buildCustomPrompt(patient: Patient): string {
    const basePrompt = `You are Tziporah, Dr. Jeffrey Bander's AI assistant for cardiology follow-up calls. 

Patient Information:
- Name: ${patient.firstName} ${patient.lastName}
- DOB: ${patient.dateOfBirth}
- MRN: ${patient.mrn}
- Condition: ${patient.condition}
- Risk Level: ${patient.riskLevel}`;

    if (patient.customPrompt) {
      return `${basePrompt}

${patient.customPrompt}

Please conduct a warm, professional follow-up call to check on the patient's condition, medications, and any concerns. Keep the conversation focused and brief, escalating to urgent care if needed.`;
    }

    return `${basePrompt}

Please conduct a warm, professional follow-up call to check on the patient's condition, medications, and any concerns. Keep the conversation focused and brief, escalating to urgent care if needed.`;
  }

  // Method to handle Twilio status callbacks
  async handleTwilioCallback(callSid: string, callStatus: string, duration?: string) {
    try {
      // Find the call by Twilio SID
      const calls = await storage.getCalls();
      const call = calls.find(c => c.twilioCallSid === callSid);
      
      if (!call) {
        console.log(`[CALL-SCHEDULER] No call found for Twilio SID: ${callSid}`);
        return;
      }

      // Find the associated attempt
      const attempts = await storage.getCallAttempts();
      const attempt = attempts.find(a => a.callId === call.id);

      if (!attempt) {
        console.log(`[CALL-SCHEDULER] No attempt found for call ID: ${call.id}`);
        return;
      }

      switch (callStatus) {
        case 'completed':
          if (duration && parseInt(duration) > 10) {
            // Call lasted more than 10 seconds, consider it successful
            await this.handleCallSuccess(attempt, call.id);
            await storage.updateCall(call.id, {
              status: 'completed',
              outcome: 'routine',
              duration: parseInt(duration),
              completedAt: new Date(),
            });
          } else {
            // Very short call, likely no answer
            await this.handleCallFailure(attempt, 'No answer or very short call');
            await storage.updateCall(call.id, {
              status: 'failed',
              outcome: 'no_answer',
              duration: duration ? parseInt(duration) : 0,
              completedAt: new Date(),
            });
          }
          break;

        case 'failed':
        case 'busy':
        case 'no-answer':
          await this.handleCallFailure(attempt, `Call ${callStatus}`);
          await storage.updateCall(call.id, {
            status: 'failed',
            outcome: callStatus,
            completedAt: new Date(),
          });
          break;

        case 'answered':
          console.log(`[CALL-SCHEDULER] Call ${callSid} answered`);
          break;

        default:
          console.log(`[CALL-SCHEDULER] Unhandled call status: ${callStatus} for ${callSid}`);
      }
    } catch (error) {
      console.error(`[CALL-SCHEDULER] Error handling Twilio callback:`, error);
    }
  }
}

// Global scheduler instance
export const callScheduler = new CallSchedulerService();