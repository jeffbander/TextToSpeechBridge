import { Express, Request, Response } from 'express';
import { smsService } from './services/sms';
import { storage } from './storage';

export function registerSMSRoutes(app: Express) {
  console.log('[SMS] Initializing SMS messaging routes');

  // Send individual SMS
  app.post('/api/sms/send', async (req: Request, res: Response) => {
    try {
      const { patientId, message, templateId } = req.body;

      if (!patientId || !message) {
        return res.status(400).json({ error: 'Patient ID and message are required' });
      }

      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const result = await smsService.sendSMS(patientId, patient.phoneNumber, message, templateId);
      
      res.json({
        success: true,
        messageId: result.id,
        status: result.status,
        twilioSid: result.twilioSid
      });

    } catch (error) {
      console.error('[SMS] Error sending SMS:', error);
      res.status(500).json({ 
        error: 'Failed to send SMS',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Send bulk SMS
  app.post('/api/sms/send-bulk', async (req: Request, res: Response) => {
    try {
      const { patientIds, message, templateId } = req.body;

      if (!patientIds || !Array.isArray(patientIds) || !message) {
        return res.status(400).json({ error: 'Patient IDs array and message are required' });
      }

      const results = await smsService.sendBulkSMS(patientIds, message, templateId);
      
      const successCount = results.filter(r => r.status === 'sent').length;
      const failedCount = results.filter(r => r.status === 'failed').length;

      res.json({
        success: true,
        totalSent: successCount,
        totalFailed: failedCount,
        results: results.map(r => ({
          patientId: r.patientId,
          status: r.status,
          twilioSid: r.twilioSid,
          errorMessage: r.errorMessage
        }))
      });

    } catch (error) {
      console.error('[SMS] Error sending bulk SMS:', error);
      res.status(500).json({ 
        error: 'Failed to send bulk SMS',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get SMS templates
  app.get('/api/sms/templates', async (req: Request, res: Response) => {
    try {
      const templates = smsService.getDefaultTemplates();
      res.json(templates);
    } catch (error) {
      console.error('[SMS] Error fetching templates:', error);
      res.status(500).json({ error: 'Failed to fetch SMS templates' });
    }
  });

  // Send SMS using template
  app.post('/api/sms/send-template', async (req: Request, res: Response) => {
    try {
      const { patientId, templateId, variables = {} } = req.body;

      if (!patientId || !templateId) {
        return res.status(400).json({ error: 'Patient ID and template ID are required' });
      }

      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const templates = smsService.getDefaultTemplates();
      const template = templates.find(t => t.id === templateId);
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Replace template variables
      let message = template.message;
      message = message.replace(/{{firstName}}/g, patient.firstName);
      message = message.replace(/{{lastName}}/g, patient.lastName);
      message = message.replace(/{{patientName}}/g, `${patient.firstName} ${patient.lastName}`);
      message = message.replace(/{{doctorName}}/g, 'Dr. Jeffrey Bander');
      message = message.replace(/{{officeName}}/g, 'CardioCare AI');

      // Apply any custom variables
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        message = message.replace(regex, variables[key]);
      });

      const result = await smsService.sendSMS(patientId, patient.phoneNumber, message, templateId);
      
      res.json({
        success: true,
        messageId: result.id,
        status: result.status,
        twilioSid: result.twilioSid,
        message: message
      });

    } catch (error) {
      console.error('[SMS] Error sending template SMS:', error);
      res.status(500).json({ 
        error: 'Failed to send template SMS',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Twilio webhook for incoming SMS
  app.post('/sms-webhook', async (req: Request, res: Response) => {
    try {
      const { From, Body, MessageSid } = req.body;
      
      console.log(`[SMS] Webhook received from ${From}: ${Body}`);
      
      await smsService.handleIncomingSMS(From, Body, MessageSid);
      
      // Respond with TwiML (empty response means no auto-reply)
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    } catch (error) {
      console.error('[SMS] Error handling webhook:', error);
      res.status(500).send('Error processing SMS webhook');
    }
  });

  // Get SMS history for a patient
  app.get('/api/patients/:id/sms', async (req: Request, res: Response) => {
    try {
      const patientId = parseInt(req.params.id);
      
      // TODO: Implement when SMS message storage is ready
      // const messages = await storage.getSMSMessagesByPatient(patientId);
      
      res.json([]);
      
    } catch (error) {
      console.error('[SMS] Error fetching SMS history:', error);
      res.status(500).json({ error: 'Failed to fetch SMS history' });
    }
  });

  console.log('[SMS] SMS messaging routes registered');
}