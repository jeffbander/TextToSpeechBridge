import type { Express } from "express";
import { storage } from "./storage";
import { twilioService } from "./services/twilio";
import { patientPromptManager } from "./services/patient-prompt-manager";
import { openaiRealtimeService } from "./services/openai-realtime";
import OpenAI from "openai";

export function registerTwilioIntegrationRoutes(app: Express) {
  console.log("[TWILIO-INTEGRATION] Initializing Twilio-to-GPT-4o integration routes");

  // Start automated patient call with GPT-4o integration
  app.post("/api/twilio/call-patient", async (req, res) => {
    try {
      console.log(`[TWILIO-INTEGRATION] Received request body:`, req.body);
      
      const { 
        patientId, 
        urgencyLevel = 'medium', 
        visitReason, 
        medications = [], 
        customInstructions,
        useCustomPrompt,
        generatedPrompt 
      } = req.body;
      
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

      // Create GPT-4o realtime session for this call
      const sessionId = await openaiRealtimeService.createRealtimeSession(
        patient.id,
        `${patient.firstName} ${patient.lastName}`,
        call.id,
        systemPrompt
      );

      // Configure the session with patient-specific prompt
      console.log(`[TWILIO-INTEGRATION] Created GPT-4o session ${sessionId} for patient ${patient.firstName} ${patient.lastName}`);

      // Generate Twilio webhook URL for this specific session
      console.log(`[TWILIO-INTEGRATION] REPLIT_DOMAINS env var:`, process.env.REPLIT_DOMAINS);
      const baseUrl = process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS}` : 'https://localhost:5000';
      const webhookUrl = `${baseUrl}/api/twilio/webhook/${sessionId}`;
      
      console.log(`[TWILIO-INTEGRATION] Base URL: ${baseUrl}`);
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
        message: `Automated call initiated for ${patient.firstName} ${patient.lastName}`
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

      // Use custom greeting from patient's custom prompt if available
      let initialGreeting;
      if (session.customSystemPrompt && session.customSystemPrompt.includes("Dr. Bander's office")) {
        // Extract greeting from custom prompt or use a contextual one
        initialGreeting = `Hello ${patient.firstName}, this is Tziporah calling from Dr. Bander's cardiology office at 432 Bedford Ave. I'm following up on your recent visit. How are you feeling today?`;
      } else if (session.customSystemPrompt) {
        // Use a generic greeting for other custom prompts
        initialGreeting = `Hello ${patient.firstName}, I'm calling to check in with you. How are you doing?`;
      } else {
        // Fallback to standard prompt
        const patientContext = patientPromptManager.generatePatientSpecificPrompt({
          patient,
          urgencyLevel: 'medium'
        });
        initialGreeting = patientContext.initialGreeting;
      }

      // Initialize GPT-4o real-time connection for this session
      await openaiRealtimeService.initializeOpenAIRealtime(sessionId);

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

  console.log("[TWILIO-INTEGRATION] Twilio-to-GPT-4o integration routes registered");
}