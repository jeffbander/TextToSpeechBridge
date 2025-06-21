import { Express, Request, Response } from 'express';
import { storage } from './storage';
import { z } from 'zod';
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendMessageSchema = z.object({
  patientId: z.number(),
  message: z.string().min(1, "Message cannot be empty"),
});

export function registerSmsRoutes(app: Express) {
  console.log('[SMS] Initializing SMS messaging routes');

  // Send SMS to patient
  app.post("/api/sms/send", async (req: Request, res: Response) => {
    try {
      console.log('[SMS] Request body:', req.body);
      const { patientId, message } = sendMessageSchema.parse(req.body);
      console.log('[SMS] Parsed data:', { patientId, message });
      
      // Get patient information
      const patient = await storage.getPatient(patientId);
      console.log('[SMS] Patient found:', patient ? `${patient.firstName} ${patient.lastName}` : 'null');
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Store outbound message in database
      const messageRecord = await storage.createMessage({
        patientId,
        direction: 'outbound',
        message,
        status: 'sending',
      });

      try {
        // Send SMS via Twilio
        const twilioMessage = await twilioClient.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: patient.phoneNumber,
        });

        // Update message with Twilio SID and status
        await storage.updateMessage(messageRecord.id, {
          twilioSid: twilioMessage.sid,
          status: 'sent',
        });

        console.log(`[SMS] Message sent to ${patient.firstName} ${patient.lastName} (${patient.phoneNumber}): ${twilioMessage.sid}`);
        
        res.json({
          success: true,
          messageId: messageRecord.id,
          twilioSid: twilioMessage.sid,
          message: "SMS sent successfully"
        });

      } catch (twilioError: any) {
        console.error('[SMS] Twilio error:', twilioError);
        
        // Update message with error status
        await storage.updateMessage(messageRecord.id, {
          status: 'failed',
          errorMessage: twilioError.message,
        });

        res.status(500).json({
          success: false,
          message: "Failed to send SMS",
          error: twilioError.message
        });
      }

    } catch (error: any) {
      console.error('[SMS] Error sending message:', error);
      res.status(400).json({
        message: "Invalid request",
        error: error.message
      });
    }
  });

  // Get messages for a patient
  app.get("/api/sms/patient/:patientId", async (req: Request, res: Response) => {
    try {
      const patientId = parseInt(req.params.patientId);
      
      if (isNaN(patientId)) {
        return res.status(400).json({ message: "Invalid patient ID" });
      }

      const messages = await storage.getMessagesByPatient(patientId);
      
      // Sort messages by sent date (most recent first)
      messages.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      
      res.json(messages);

    } catch (error: any) {
      console.error('[SMS] Error fetching messages:', error);
      res.status(500).json({
        message: "Failed to fetch messages",
        error: error.message
      });
    }
  });

  // Twilio webhook for incoming SMS
  app.post("/twilio-sms-webhook", async (req: Request, res: Response) => {
    try {
      const { From, Body, MessageSid } = req.body;
      
      console.log(`[SMS] Incoming message from ${From}: ${Body}`);

      // Find patient by phone number
      const patients = await storage.getPatients();
      const patient = patients.find(p => p.phoneNumber === From);

      if (patient) {
        // Store incoming message
        await storage.createMessage({
          patientId: patient.id,
          direction: 'inbound',
          message: Body,
          status: 'received',
          twilioSid: MessageSid,
          receivedAt: new Date(),
        });

        console.log(`[SMS] Stored incoming message for patient ${patient.firstName} ${patient.lastName}`);
      } else {
        console.log(`[SMS] Received message from unknown number: ${From}`);
      }

      // Respond with TwiML
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    } catch (error: any) {
      console.error('[SMS] Error processing incoming message:', error);
      res.status(500).send('Error processing message');
    }
  });

  console.log('[SMS] SMS messaging routes registered');
}