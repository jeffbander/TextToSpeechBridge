import type { Express } from "express";
import { storage } from "./storage";
import { twilioService } from "./services/twilio";
import { patientPromptManager } from "./services/patient-prompt-manager";
import { openaiRealtimeService } from "./services/openai-realtime";
import OpenAI from "openai";

export function registerTwilioIntegrationRoutes(app: Express) {
  console.log("[TWILIO-INTEGRATION] Initializing Twilio-to-GPT-4o integration routes");

  // Start automated patient call with GPT-4o integration
  app.post("/api/twilio/automated-calls", async (req, res) => {
    try {
      console.log(`[TWILIO-INTEGRATION] Received request body:`, req.body);
      
      const { 
        patientId, 
        urgencyLevel = 'medium', 
        visitReason, 
        medications, 
        customInstructions,
        useCustomPrompt,
        generatedPrompt 
      } = req.body;
      
      // Handle medications as both string and array
      const medicationsArray = Array.isArray(medications) 
        ? medications 
        : medications 
          ? medications.split(',').map((med: string) => med.trim()).filter(Boolean)
          : [];
      
      if (!patientId) {
        return res.status(400).json({ message: "Patient ID is required" });
      }
      
      console.log(`[TWILIO-INTEGRATION] Starting automated call for patient ID: ${patientId}`);
      
      // CRITICAL: Check for existing active calls to prevent duplicate Twilio sessions
      const existingActiveCalls = await storage.getActiveCallsByPatientId(patientId);
      const activeCall = existingActiveCalls.find((call: any) => 
        call.status === 'active' || call.status === 'calling' || call.status === 'in_progress'
      );
      
      if (activeCall) {
        console.log(`🚫 PREVENTING DUPLICATE CALL - Patient ${patientId} already has active call ${activeCall.id}`);
        return res.status(409).json({ 
          message: "Patient already has an active call",
          existingCallId: activeCall.id,
          status: activeCall.status
        });
      }
      
      // Get patient information
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Create patient context for personalized prompts
      const patientContext = {
        patient,
        recentVisitReason: visitReason,
        currentMedications: medicationsArray,
        knownConditions: [patient.condition],
        urgencyLevel: urgencyLevel as 'low' | 'medium' | 'high' | 'critical'
      };

      // Check for patient's saved custom prompt first, then use provided custom prompt, otherwise use standard
      let systemPrompt;
      if (patient.customPrompt && patient.customPrompt.trim()) {
        systemPrompt = patient.customPrompt;
        console.log(`[TWILIO-INTEGRATION] Using patient's saved custom prompt for ${patient.firstName} ${patient.lastName}`);
      } else if (useCustomPrompt && generatedPrompt) {
        systemPrompt = generatedPrompt.systemPrompt;
        console.log(`[TWILIO-INTEGRATION] Using request custom prompt for ${patient.firstName} ${patient.lastName}`);
      } else {
        systemPrompt = patientPromptManager.createTwilioSystemPrompt(patientContext);
        console.log(`[TWILIO-INTEGRATION] Using standard prompt for ${patient.firstName} ${patient.lastName}`);
      }
      
      // Create call record
      const call = await storage.createCall({
        patientId: patient.id,
        status: 'initiated',
        callType: 'automated_gpt4o',
        metadata: {
          systemPrompt,
          urgencyLevel,
          visitReason,
          medications,
          customInstructions,
          useCustomPrompt,
          customPromptData: useCustomPrompt ? generatedPrompt : null
        }
      });

      // Skip realtime session creation - using voice pipeline instead
      // const sessionId = await openaiRealtimeService.createRealtimeSession(
      //   patient.id,
      //   `${patient.firstName} ${patient.lastName}`,
      //   call.id,
      //   systemPrompt
      // );
      
      // For voice pipeline, we don't need a session ID upfront - it's created during the webhook call

      // Configure voice pipeline call
      console.log(`[TWILIO-INTEGRATION] Setting up voice pipeline call for patient ${patient.firstName} ${patient.lastName}`);

      // Generate Twilio webhook URL that will redirect to voice pipeline
      console.log(`[TWILIO-INTEGRATION] REPLIT_DOMAINS env var:`, process.env.REPLIT_DOMAINS);
      const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : 'https://localhost:5000';
      const webhookUrl = `${baseUrl}/twilio-gpt4o-webhook`; // This will redirect to voice pipeline
      
      console.log(`[TWILIO-INTEGRATION] Base URL: ${baseUrl}`);
      console.log(`[TWILIO-INTEGRATION] Using webhook URL: ${webhookUrl} (redirects to voice pipeline)`);
      
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

      console.log(`[TWILIO-INTEGRATION] Twilio call initiated: ${twilioCallSid} for voice pipeline call`);

      res.json({
        success: true,
        callId: call.id,
        twilioCallSid,
        message: `Voice pipeline call initiated for ${patient.firstName} ${patient.lastName}`
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

      // Get patient data
      const patient = await storage.getPatient(session.patientId);
      if (!patient) {
        return res.status(404).send('<Response><Say>Patient information not found</Say><Hangup/></Response>');
      }

      // Connect to real-time session without auto-initiating conversation
      console.log(`[TWILIO-WEBHOOK] Connecting to real-time session for ${patient.firstName}`);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${req.get('host')}/ws/realtime/${sessionId}" />
  </Connect>
</Response>`;

      res.type('text/xml').send(twiml);

    } catch (error) {
      console.error('[TWILIO-WEBHOOK] Error handling webhook:', error);
      res.status(500).send('<Response><Say>Connection error</Say><Hangup/></Response>');
    }
  });

  // Process patient speech and generate AI response
  app.post("/api/twilio/process-speech/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { SpeechResult, Confidence } = req.body;
      
      console.log(`[TWILIO-SPEECH] Processing speech for session ${sessionId}: "${SpeechResult}" (confidence: ${Confidence})`);

      // Get the active session
      const session = openaiRealtimeService.getActiveSession(sessionId);
      if (!session) {
        return res.status(404).send('<Response><Say>Session expired</Say><Hangup/></Response>');
      }

      // Process the patient's speech with GPT-4o
      if (SpeechResult && SpeechResult.trim()) {
        // Add patient's speech to conversation log
        session.conversationLog.push({
          timestamp: new Date(),
          speaker: 'patient',
          text: SpeechResult
        });

        // Generate AI response using OpenAI
        const response = await generateAIResponse(sessionId, SpeechResult);
        
        // Add AI response to conversation log
        session.conversationLog.push({
          timestamp: new Date(),
          speaker: 'ai',
          text: response
        });

        // Continue conversation with follow-up question
        const followUpTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/api/twilio/process-speech/${sessionId}" method="POST" speechTimeout="auto" timeout="15">
    <Say voice="Polly.Joanna-Neural">${response}</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">Thank you for sharing. Is there anything else you'd like to discuss about your health?</Say>
  <Gather input="speech" action="/api/twilio/process-speech/${sessionId}" method="POST" speechTimeout="auto" timeout="10">
    <Say voice="Polly.Joanna-Neural">Please let me know if you have any other concerns.</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">Thank you for your time. Take care and remember to follow your treatment plan. Goodbye.</Say>
</Response>`;

        res.type('text/xml').send(followUpTwiML);
      } else {
        // No speech detected, ask again
        const clarificationTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/api/twilio/process-speech/${sessionId}" method="POST" speechTimeout="auto" timeout="10">
    <Say voice="Polly.Joanna-Neural">I'm sorry, I didn't catch that. Could you please repeat how you've been feeling?</Say>
  </Gather>
  <Say voice="Polly.Joanna-Neural">Thank you for your time. Have a great day.</Say>
</Response>`;

        res.type('text/xml').send(clarificationTwiML);
      }

    } catch (error) {
      console.error('[TWILIO-SPEECH] Error processing speech:', error);
      res.status(500).send('<Response><Say>Sorry, there was an error. Please call back later.</Say><Hangup/></Response>');
    }
  });

  // Helper method for generating AI responses
  async function generateAIResponse(sessionId: string, patientInput: string): Promise<string> {
    try {
      const session = openaiRealtimeService.getActiveSession(sessionId);
      if (!session) return "Thank you for calling.";

      // Use session's custom prompt if available, otherwise use default
      let basePrompt;
      if (session.customSystemPrompt && session.customSystemPrompt.trim()) {
        console.log(`🎯 Using CUSTOM prompt for ${session.patientName}: ${session.customSystemPrompt.substring(0, 80)}...`);
        basePrompt = `${session.customSystemPrompt}

Patient Context: This is ${session.patientName}
Patient just said: "${patientInput}"

Respond according to your role as described above. Use your specific medical knowledge and conversation style.`;
      } else {
        console.log(`⚠️ Using FALLBACK prompt for ${session.patientName}`);
        basePrompt = `You are Dr. Wellman conducting a post-discharge follow-up call with ${session.patientName}. 
        
Patient just said: "${patientInput}"

Respond as a caring healthcare provider. Ask relevant follow-up questions about their recovery, symptoms, medications, or concerns.`;
      }

      // Use OpenAI to generate contextual response
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: basePrompt }],
        max_tokens: 150,
        temperature: 0.7
      });

      console.log(`🤖 AI Response for ${session.patientName}: ${completion.choices[0].message.content?.substring(0, 60)}...`);

      return completion.choices[0].message.content || "Thank you for sharing that with me.";
      
    } catch (error) {
      console.error('[AI-RESPONSE] Error generating response:', error);
      return "Thank you for that information. How else are you feeling?";
    }
  }

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

  // GPT-4o webhook endpoint for automated campaign calls
  app.post("/twilio-gpt4o-webhook", async (req, res) => {
    try {
      const { CallSid, From, To } = req.body;
      console.log(`[GPT4O-WEBHOOK] Incoming call - CallSid: ${CallSid}, From: ${From}, To: ${To}`);

      // Find the call record and patient by phone number
      const calls = await storage.getCalls();
      const activeCall = calls.find(call => 
        call.twilioCallSid === CallSid || 
        (call.status === 'in_progress' && !call.twilioCallSid)
      );

      if (!activeCall) {
        console.error(`[GPT4O-WEBHOOK] No active call found for CallSid: ${CallSid}`);
        return res.status(404).type('text/xml').send(`
          <?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Say>Call not found in system</Say>
            <Hangup/>
          </Response>
        `);
      }

      // Get patient information
      const patient = await storage.getPatient(activeCall.patientId);
      if (!patient) {
        console.error(`[GPT4O-WEBHOOK] Patient not found for call: ${activeCall.id}`);
        return res.status(404).type('text/xml').send(`
          <?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Say>Patient not found</Say>
            <Hangup/>
          </Response>
        `);
      }

      console.log(`[GPT4O-WEBHOOK] Patient: ${patient.firstName} ${patient.lastName}`);
      console.log(`[GPT4O-WEBHOOK] Custom prompt exists: ${!!patient.customPrompt}`);

      // REDIRECTING TO VOICE PIPELINE - Updated workflow: Twilio → Whisper → GPT-4o → TTS
      console.log(`[GPT4O-WEBHOOK] Redirecting to voice pipeline for better reliability`);

      // Create voice pipeline session ID
      const voiceSessionId = `voice_${activeCall.id}_${Date.now()}`;

      // Update call with session info
      await storage.updateCall(activeCall.id, {
        twilioCallSid: CallSid,
        status: 'in_progress'
      });

      console.log(`[GPT4O-WEBHOOK] Created voice pipeline session: ${voiceSessionId} for call: ${activeCall.id}`);

      // Generate TwiML to connect to voice pipeline WebSocket
      const baseUrl = req.get('host');
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${baseUrl}/ws/voice-pipeline/${voiceSessionId}" />
  </Connect>
</Response>`;

      console.log(`[GPT4O-WEBHOOK] Connecting to voice pipeline stream: wss://${baseUrl}/ws/voice-pipeline/${voiceSessionId}`);

      res.type('text/xml').send(twiml);

    } catch (error) {
      console.error('[GPT4O-WEBHOOK] Error handling webhook:', error);
      res.status(500).type('text/xml').send(`
        <?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Connection error occurred</Say>
          <Hangup/>
        </Response>
      `);
    }
  });

  // Status callback endpoint for call updates
  app.post("/twilio-status-callback", async (req, res) => {
    try {
      const { CallSid, CallStatus, CallDuration } = req.body;
      console.log(`[TWILIO-STATUS] CallSid: ${CallSid}, Status: ${CallStatus}, Duration: ${CallDuration}`);

      // Find and update the call record
      const calls = await storage.getCalls();
      const call = calls.find(c => c.twilioCallSid === CallSid);
      
      if (call) {
        const updates: any = {};
        
        if (CallStatus === 'completed') {
          updates.status = 'completed';
          updates.duration = CallDuration ? parseInt(CallDuration) : null;
        } else if (CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
          updates.status = 'failed';
          updates.outcome = CallStatus;
        }

        if (Object.keys(updates).length > 0) {
          await storage.updateCall(call.id, updates);
          console.log(`[TWILIO-STATUS] Updated call ${call.id} with status: ${CallStatus}`);
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('[TWILIO-STATUS] Error handling status callback:', error);
      res.status(500).send('Error');
    }
  });

  console.log("[TWILIO-INTEGRATION] Twilio-to-GPT-4o integration routes registered");
}