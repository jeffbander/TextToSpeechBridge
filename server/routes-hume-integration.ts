import { Express } from 'express';
import WebSocket from 'ws';
import { storage } from './storage';
import { humeAIService } from './services/hume-ai-service';
import { twilioService } from './services/twilio';

export function registerHumeIntegrationRoutes(app: Express) {
  console.log('[HUME-INTEGRATION] Initializing Hume AI EVI integration routes');

  /**
   * Twilio webhook endpoint that connects calls to Hume AI EVI
   */
  app.post('/api/hume/twilio-webhook/:patientId/:callId', async (req, res) => {
    const { patientId, callId } = req.params;
    
    try {
      console.log(`[HUME-INTEGRATION] Twilio webhook called for patient ${patientId}, call ${callId}`);
      
      // Start Hume AI session for this patient
      const sessionId = await humeAIService.startCallSession(Number(patientId), Number(callId));
      
      // Generate base URL
      const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : 'https://localhost:5000';
      
      // Generate TwiML that connects to Hume EVI
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Hello, this is your healthcare assistant. Please hold while I connect you.</Say>
    <Connect>
        <Stream url="wss://${baseUrl.replace('https://', '')}/hume-evi-stream/${sessionId}" />
    </Connect>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
      
      console.log(`[HUME-INTEGRATION] Generated TwiML for session ${sessionId}`);
      
    } catch (error) {
      console.error('[HUME-INTEGRATION] Error handling Twilio webhook:', error);
      
      // Fallback TwiML
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>I'm sorry, there was a technical issue. Please try calling back in a few minutes.</Say>
    <Hangup/>
</Response>`;
      
      res.type('text/xml');
      res.send(errorTwiml);
    }
  });

  /**
   * Start automated call using Hume AI
   */
  app.post('/api/hume/start-call', async (req, res) => {
    try {
      const { patientId, useCustomPrompt = false, generatedPrompt } = req.body;
      
      // Get patient information
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Check for existing active calls
      const activeCalls = await storage.getActiveCallsByPatientId(patientId);
      if (activeCalls.length > 0) {
        const activeCall = activeCalls[0];
        return res.status(409).json({ 
          message: "Patient already has an active call",
          callId: activeCall.id,
          status: activeCall.status
        });
      }
      
      // Create call record
      const call = await storage.createCall({
        patientId: patient.id,
        status: 'initiated',
        callType: 'automated_hume_evi',
        metadata: {
          useCustomPrompt,
          customPromptData: useCustomPrompt ? generatedPrompt : null
        }
      });

      // Generate Twilio webhook URL for Hume integration
      const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : 'https://localhost:5000';
      const webhookUrl = `${baseUrl}/api/hume/twilio-webhook/${patientId}/${call.id}`;
      
      console.log(`[HUME-INTEGRATION] Using webhook URL: ${webhookUrl}`);
      
      // Make the Twilio call
      const twilioCallSid = await twilioService.makeCall({
        to: patient.phoneNumber,
        url: webhookUrl,
        statusCallback: `${baseUrl}/api/twilio/status/${call.id}`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
      });

      // Update call with Twilio SID
      await storage.updateCall(call.id, {
        twilioCallSid,
        status: 'calling'
      });

      console.log(`[HUME-INTEGRATION] Hume AI call initiated: ${twilioCallSid} for patient ${patient.firstName} ${patient.lastName}`);

      res.json({
        success: true,
        callId: call.id,
        twilioCallSid,
        message: `Hume AI call initiated for ${patient.firstName} ${patient.lastName}`
      });

    } catch (error) {
      console.error('[HUME-INTEGRATION] Error starting call:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to start call',
        error: error.message 
      });
    }
  });

  /**
   * Get patient documents for a specific patient (for testing and verification)
   */
  app.get('/api/hume/patient-documents/:patientId', async (req, res) => {
    try {
      const { patientId } = req.params;
      const documents = await storage.getActivePatientDocuments(Number(patientId));
      res.json(documents);
    } catch (error) {
      console.error('[HUME-INTEGRATION] Error fetching patient documents:', error);
      res.status(500).json({ message: 'Failed to fetch patient documents' });
    }
  });

  /**
   * Add a document for a patient
   */
  app.post('/api/hume/patient-documents', async (req, res) => {
    try {
      const { patientId, title, content, documentType, priority = 1 } = req.body;
      
      const document = await storage.createPatientDocument({
        patientId,
        title,
        content,
        documentType,
        priority,
        isActive: true
      });
      
      console.log(`[HUME-INTEGRATION] Created document "${title}" for patient ${patientId}`);
      res.json(document);
      
    } catch (error) {
      console.error('[HUME-INTEGRATION] Error creating patient document:', error);
      res.status(500).json({ message: 'Failed to create patient document' });
    }
  });

  /**
   * WebSocket endpoint for Hume EVI streaming
   * This would handle the actual voice streaming to/from Hume AI
   */
  app.get('/hume-evi-stream/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    console.log(`[HUME-INTEGRATION] WebSocket stream requested for session ${sessionId}`);
    
    // For now, return a simple response
    // In a full implementation, this would upgrade to WebSocket and handle Hume EVI streaming
    res.json({
      message: 'Hume EVI stream endpoint',
      sessionId,
      status: 'ready',
      instructions: 'This endpoint would handle WebSocket upgrade for Hume EVI streaming'
    });
  });

  console.log('[HUME-INTEGRATION] Hume AI EVI integration routes registered');
}