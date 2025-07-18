import { MailService } from '@sendgrid/mail';

let mailService: MailService | null = null;

const initializeSendGrid = () => {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not provided. Email functionality will be disabled.');
    return false;
  }
  
  try {
    mailService = new MailService();
    mailService.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('SendGrid service initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize SendGrid:', error);
    return false;
  }
};

// Try to initialize on module load
initializeSendGrid();

interface UrgentAlertEmailParams {
  to: string;
  patientName: string;
  concern: string;
  urgencyLevel: string;
  callSummary: string;
  patientPhone: string;
}

export class SendGridService {
  private ensureServiceInitialized(): void {
    if (!mailService) {
      throw new Error('SendGrid service not initialized. Please check your SendGrid credentials.');
    }
  }

  async sendUrgentAlert(params: UrgentAlertEmailParams): Promise<boolean> {
    if (!mailService) {
      console.warn('SendGrid not configured. Email alert skipped.');
      return false;
    }
    
    try {
      const emailContent = {
        to: params.to,
        from: process.env.FROM_EMAIL || 'alerts@cardiocare.ai',
        subject: `🚨 URGENT: Patient Alert - ${params.patientName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f44336; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">🚨 URGENT PATIENT ALERT</h1>
            </div>
            
            <div style="padding: 20px; background-color: #f9f9f9;">
              <h2 style="color: #1976d2;">Patient Information</h2>
              <p><strong>Name:</strong> ${params.patientName}</p>
              <p><strong>Phone:</strong> ${params.patientPhone}</p>
              <p><strong>Urgency Level:</strong> <span style="color: #f44336; font-weight: bold;">${params.urgencyLevel.toUpperCase()}</span></p>
              
              <h2 style="color: #1976d2;">Reported Concern</h2>
              <p style="background-color: white; padding: 15px; border-left: 4px solid #f44336;">
                ${params.concern}
              </p>
              
              <h2 style="color: #1976d2;">Call Summary</h2>
              <p style="background-color: white; padding: 15px; border-left: 4px solid #1976d2;">
                ${params.callSummary}
              </p>
              
              <div style="text-align: center; margin-top: 30px;">
                <p style="color: #666;">This alert was generated by CardioCare AI Patient Outreach System</p>
                <p style="font-size: 12px; color: #999;">Please contact the patient immediately for urgent concerns.</p>
              </div>
            </div>
          </div>
        `,
        text: `
          URGENT PATIENT ALERT
          
          Patient: ${params.patientName}
          Phone: ${params.patientPhone}
          Urgency: ${params.urgencyLevel.toUpperCase()}
          
          Concern: ${params.concern}
          
          Call Summary: ${params.callSummary}
          
          Please contact the patient immediately.
        `
      };

      await mailService.send(emailContent);
      return true;
    } catch (error) {
      console.error('SendGrid urgent alert error:', error);
      return false;
    }
  }

  async sendDailySummary(
    to: string,
    stats: {
      totalCalls: number;
      urgentAlerts: number;
      completedCalls: number;
      pendingFollowups: number;
    }
  ): Promise<boolean> {
    if (!mailService) {
      console.warn('SendGrid not configured. Daily summary email skipped.');
      return false;
    }
    
    try {
      const emailContent = {
        to,
        from: process.env.FROM_EMAIL || 'reports@cardiocare.ai',
        subject: 'CardioCare AI - Daily Summary Report',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #1976d2; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">📊 Daily Summary Report</h1>
              <p style="margin: 5px 0 0 0;">${new Date().toLocaleDateString()}</p>
            </div>
            
            <div style="padding: 20px;">
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
                <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; text-align: center;">
                  <h3 style="margin: 0; color: #1976d2;">${stats.totalCalls}</h3>
                  <p style="margin: 5px 0 0 0; color: #666;">Total Calls</p>
                </div>
                <div style="background-color: ${stats.urgentAlerts > 0 ? '#ffebee' : '#e8f5e8'}; padding: 15px; border-radius: 8px; text-align: center;">
                  <h3 style="margin: 0; color: ${stats.urgentAlerts > 0 ? '#f44336' : '#4caf50'};">${stats.urgentAlerts}</h3>
                  <p style="margin: 5px 0 0 0; color: #666;">Urgent Alerts</p>
                </div>
                <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; text-align: center;">
                  <h3 style="margin: 0; color: #4caf50;">${stats.completedCalls}</h3>
                  <p style="margin: 5px 0 0 0; color: #666;">Completed</p>
                </div>
                <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; text-align: center;">
                  <h3 style="margin: 0; color: #ff9800;">${stats.pendingFollowups}</h3>
                  <p style="margin: 5px 0 0 0; color: #666;">Pending Follow-ups</p>
                </div>
              </div>
              
              <p style="text-align: center; color: #666; margin-top: 30px;">
                Generated by CardioCare AI Patient Outreach System
              </p>
            </div>
          </div>
        `
      };

      await mailService!.send(emailContent);
      return true;
    } catch (error) {
      console.error('SendGrid daily summary error:', error);
      return false;
    }
  }
}

export const sendGridService = new SendGridService();
