import type { Express } from "express";
import { storage } from "./storage";
import { twilioService } from "./services/twilio";
import { patientPromptManager } from "./services/patient-prompt-manager";
import { openaiRealtimeService } from "./services/openai-realtime";

export function registerTwilioIntegrationRoutes(app: Express) {
  console.log("[TWILIO-INTEGRATION] Initializing Twilio-to-GPT-4o integration routes");

  // Start automated patient call with GPT-4o integration
  app.post("/api/twilio/call-patient", async (req, res) => {
    try {
      console.log(`[TWILIO-INTEGRATION] Received request body:`, req.body);
      
      const { patientId, urgencyLevel = 'medium', visitReason, medications = [] } = req.body;
      
      if (!patientId) {
        return res.status(400).json({ message: "Patient ID is required" });
      }
      
      console.log(`[TWILIO-INTEGRATION] Starting automated call for patient ID: ${patientId}`);
      
      // Get patient information
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Create patient context for personalized prompts
      const patientContext = {
        patient,
        recentVisitReason: visitReason,
        currentMedications: medications,
        knownConditions: [patient.condition],
        urgencyLevel: urgencyLevel as 'low' | 'medium' | 'high' | 'critical'
      };

      // Generate patient-specific system prompt
      const systemPrompt = patientPromptManager.createTwilioSystemPrompt(patientContext);
      
      // Create call record
      const call = await storage.createCall({
        patientId: patient.id,
        status: 'initiated',
        callType: 'automated_gpt4o',
        metadata: {
          systemPrompt,
          urgencyLevel,
          visitReason,
          medications
        }
      });

      // Create GPT-4o realtime session for this call
      const sessionId = await openaiRealtimeService.createRealtimeSession(
        patient.id,
        patient.name,
        call.id
      );

      // Configure the session with patient-specific prompt
      console.log(`[TWILIO-INTEGRATION] Created GPT-4o session ${sessionId} for patient ${patient.name}`);

      // Generate Twilio webhook URL for this specific session
      const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : 'https://localhost:5000';
      const webhookUrl = `${baseUrl}/api/twilio/webhook/${sessionId}`;
      
      console.log(`[TWILIO-INTEGRATION] Using webhook URL: ${webhookUrl}`);
      
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

      console.log(`[TWILIO-INTEGRATION] Twilio call initiated: ${twilioCallSid} for session: ${sessionId}`);

      res.json({
        success: true,
        callId: call.id,
        sessionId,
        twilioCallSid,
        message: `Automated call initiated for ${patient.name}`
      });

    } catch (error) {
      console.error('[TWILIO-INTEGRATION] Error starting automated call:', error);
      console.error('[TWILIO-INTEGRATION] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        patientId: req.body.patientId
      });
      res.status(500).json({ 
        message: "Failed to start automated call",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Twilio webhook handler for GPT-4o sessions
  app.post("/api/twilio/webhook/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      console.log(`[TWILIO-WEBHOOK] Incoming call for session: ${sessionId}`);

      // Get the active GPT-4o session
      const session = openaiRealtimeService.getActiveSession(sessionId);
      if (!session) {
        console.error(`[TWILIO-WEBHOOK] No active session found for: ${sessionId}`);
        return res.status(404).send('<Response><Say>Session not found</Say><Hangup/></Response>');
      }

      // Generate TwiML that connects to GPT-4o real-time audio
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">Hello, connecting you to your healthcare assistant.</Say>
  <Connect>
    <Stream url="wss://${req.get('host')}/ws/twilio/${sessionId}" />
  </Connect>
</Response>`;

      res.type('text/xml').send(twiml);

    } catch (error) {
      console.error('[TWILIO-WEBHOOK] Error handling webhook:', error);
      res.status(500).send('<Response><Say>Connection error</Say><Hangup/></Response>');
    }
  });

  // Twilio call status updates
  app.post("/api/twilio/status/:callId", async (req, res) => {
    try {
      const { callId } = req.params;
      const { CallStatus, Duration } = req.body;
      
      console.log(`[TWILIO-STATUS] Call ${callId} status: ${CallStatus}`);

      // Update call status in database
      const updates: any = { status: CallStatus.toLowerCase() };
      if (Duration) {
        updates.duration = parseInt(Duration);
      }

      await storage.updateCall(parseInt(callId), updates);

      // If call completed, end the GPT-4o session
      if (CallStatus === 'completed') {
        // Find and end associated session
        const allSessions = openaiRealtimeService.getAllActiveSessions();
        const associatedSession = allSessions.find(s => s.callId === parseInt(callId));
        
        if (associatedSession) {
          console.log(`[TWILIO-STATUS] Ending GPT-4o session: ${associatedSession.id}`);
          await openaiRealtimeService.endSession(associatedSession.id);
        }
      }

      res.status(200).send('OK');

    } catch (error) {
      console.error('[TWILIO-STATUS] Error updating call status:', error);
      res.status(500).send('Error');
    }
  });

  // Get automated call history
  app.get("/api/twilio/automated-calls", async (req, res) => {
    try {
      const calls = await storage.getCalls();
      const automatedCalls = calls.filter(call => call.callType === 'automated_gpt4o');
      
      res.json(automatedCalls);
    } catch (error) {
      console.error('[TWILIO-INTEGRATION] Error fetching automated calls:', error);
      res.status(500).json({ message: "Failed to fetch automated calls" });
    }
  });

  console.log("[TWILIO-INTEGRATION] Twilio-to-GPT-4o integration routes registered");
}