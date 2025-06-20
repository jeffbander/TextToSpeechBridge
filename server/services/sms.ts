import twilio from 'twilio';
import { storage } from '../storage';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export interface SMSMessage {
  id: number;
  patientId: number;
  phoneNumber: string;
  message: string;
  direction: 'outbound' | 'inbound';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'received';
  twilioSid?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
  metadata?: any;
}

export interface SMSTemplate {
  id: string;
  name: string;
  category: 'appointment' | 'medication' | 'followup' | 'general';
  message: string;
  variables: string[]; // e.g., ['patientName', 'appointmentDate', 'doctorName']
  isActive: boolean;
}

export class SMSService {
  private fromNumber = process.env.TWILIO_PHONE_NUMBER;

  async sendSMS(patientId: number, phoneNumber: string, message: string, templateId?: string): Promise<SMSMessage> {
    try {
      // Clean phone number
      const cleanPhone = this.formatPhoneNumber(phoneNumber);
      
      console.log(`[SMS] Sending message to patient ${patientId} at ${cleanPhone}`);
      
      // Send via Twilio
      const twilioMessage = await client.messages.create({
        body: message,
        from: this.fromNumber,
        to: cleanPhone
      });

      // Create SMS record
      const smsMessage: SMSMessage = {
        id: Date.now(), // Will be replaced by storage layer
        patientId,
        phoneNumber: cleanPhone,
        message,
        direction: 'outbound',
        status: 'sent',
        twilioSid: twilioMessage.sid,
        sentAt: new Date(),
        metadata: { templateId }
      };

      // Store in database (when SMS schema is ready)
      // await storage.createSMSMessage(smsMessage);
      
      console.log(`[SMS] Message sent successfully: ${twilioMessage.sid}`);
      return smsMessage;

    } catch (error) {
      console.error(`[SMS] Failed to send message to patient ${patientId}:`, error);
      
      const smsMessage: SMSMessage = {
        id: Date.now(),
        patientId,
        phoneNumber,
        message,
        direction: 'outbound',
        status: 'failed',
        sentAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };

      // Store failed message record
      // await storage.createSMSMessage(smsMessage);
      
      throw error;
    }
  }

  async sendBulkSMS(patientIds: number[], message: string, templateId?: string): Promise<SMSMessage[]> {
    const results: SMSMessage[] = [];
    
    for (const patientId of patientIds) {
      try {
        const patient = await storage.getPatient(patientId);
        if (!patient) {
          console.warn(`[SMS] Patient ${patientId} not found, skipping`);
          continue;
        }

        const personalizedMessage = this.personalizeMessage(message, patient);
        const result = await this.sendSMS(patientId, patient.phoneNumber, personalizedMessage, templateId);
        results.push(result);

        // Rate limiting - 1 message per second to avoid Twilio limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`[SMS] Failed to send bulk message to patient ${patientId}:`, error);
      }
    }

    return results;
  }

  async handleIncomingSMS(from: string, body: string, twilioSid: string): Promise<void> {
    try {
      console.log(`[SMS] Incoming message from ${from}: ${body}`);
      
      // Find patient by phone number
      const patients = await storage.getPatients();
      const patient = patients.find(p => 
        this.formatPhoneNumber(p.phoneNumber) === this.formatPhoneNumber(from)
      );

      if (!patient) {
        console.warn(`[SMS] No patient found for phone number ${from}`);
        return;
      }

      // Create incoming SMS record
      const smsMessage: SMSMessage = {
        id: Date.now(),
        patientId: patient.id,
        phoneNumber: from,
        message: body,
        direction: 'inbound',
        status: 'received',
        twilioSid,
        sentAt: new Date()
      };

      // Store in database
      // await storage.createSMSMessage(smsMessage);

      // Process auto-responses if needed
      await this.processAutoResponse(patient, body);

    } catch (error) {
      console.error(`[SMS] Error handling incoming message:`, error);
    }
  }

  private personalizeMessage(template: string, patient: any): string {
    return template
      .replace(/{{patientName}}/g, `${patient.firstName} ${patient.lastName}`)
      .replace(/{{firstName}}/g, patient.firstName)
      .replace(/{{lastName}}/g, patient.lastName)
      .replace(/{{doctorName}}/g, 'Dr. Jeffrey Bander')
      .replace(/{{officeName}}/g, 'CardioCare AI');
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add +1 if it's a 10-digit US number
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    // Add + if it starts with 1 and is 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    return phone; // Return original if format is unclear
  }

  private async processAutoResponse(patient: any, incomingMessage: string): Promise<void> {
    const lowerMessage = incomingMessage.toLowerCase();
    
    // Simple auto-response logic
    if (lowerMessage.includes('stop') || lowerMessage.includes('unsubscribe')) {
      // Mark patient as opted out
      console.log(`[SMS] Patient ${patient.id} opted out via SMS`);
      // Update patient preferences in database
    } else if (lowerMessage.includes('help')) {
      const helpMessage = "Reply STOP to unsubscribe from messages. For medical emergencies, call 911 or contact Dr. Bander's office directly.";
      await this.sendSMS(patient.id, patient.phoneNumber, helpMessage);
    }
  }

  // Predefined templates
  getDefaultTemplates(): SMSTemplate[] {
    return [
      {
        id: 'appointment_reminder',
        name: 'Appointment Reminder',
        category: 'appointment',
        message: 'Hi {{firstName}}, this is a reminder about your appointment with {{doctorName}} tomorrow. Please call if you need to reschedule.',
        variables: ['firstName', 'doctorName'],
        isActive: true
      },
      {
        id: 'medication_reminder',
        name: 'Medication Reminder',
        category: 'medication',
        message: 'Hello {{firstName}}, please remember to take your prescribed medication as directed. Contact us if you have any concerns.',
        variables: ['firstName'],
        isActive: true
      },
      {
        id: 'followup_check',
        name: 'Follow-up Check',
        category: 'followup',
        message: 'Hi {{firstName}}, how are you feeling since your last visit? Please reply with any concerns or symptoms.',
        variables: ['firstName'],
        isActive: true
      },
      {
        id: 'test_results',
        name: 'Test Results Available',
        category: 'general',
        message: 'Hello {{firstName}}, your test results are ready. Please contact {{officeName}} to discuss them with {{doctorName}}.',
        variables: ['firstName', 'officeName', 'doctorName'],
        isActive: true
      }
    ];
  }
}

export const smsService = new SMSService();