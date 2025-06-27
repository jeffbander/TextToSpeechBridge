import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { twilioService } from "./services/twilio";
import { openaiService } from "./services/openai";
import { sendGridService } from "./services/sendgrid";
import { voiceConfigManager } from "./services/voice-config";
import { promptManager } from "./services/prompt-manager";
import { insertScheduledCallSchema, insertAlertSchema } from "@shared/schema";
import { registerCallingRoutes } from "./routes-calling";
import { registerRealtimeRoutes } from "./routes-realtime";
import { registerTwilioIntegrationRoutes } from "./routes-twilio-integration";
import { registerPromptTemplateRoutes } from "./routes-prompt-templates";
import { registerPatientPromptRoutes } from "./routes-patient-prompts";
import { registerSmsRoutes } from "./routes-sms";
import { registerCsvImportRoutes } from "./routes-csv-import";
import { registerWorkingVoiceRoutes } from "./routes-working-voice";
import { setupAIGENTSRoutes } from "./services/aigents-integration";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Health check endpoint for public accessibility
  app.get('/health', (req, res) => {
    console.log(`[HEALTH] Health check requested at ${new Date().toISOString()}`);
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // Register isolated route modules
  registerCallingRoutes(app, httpServer);
  registerRealtimeRoutes(app, httpServer);
  registerTwilioIntegrationRoutes(app);
  registerWorkingVoiceRoutes(app);
  registerSmsRoutes(app);
  
  // Register AIGENTS automation routes
  setupAIGENTSRoutes(app, storage);

  // Shared endpoints that don't belong to calling or realtime modules
  
  // Conversation logs endpoints
  app.get("/api/conversation-logs", async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const logsDir = path.join(process.cwd(), 'conversation_logs');
      
      if (!fs.existsSync(logsDir)) {
        return res.json([]);
      }
      
      const files = fs.readdirSync(logsDir)
        .filter(file => file.endsWith('.txt'))
        .map(file => {
          const filepath = path.join(logsDir, file);
          const stats = fs.statSync(filepath);
          const content = fs.readFileSync(filepath, 'utf8');
          
          // Extract metadata from content
          const lines = content.split('\n');
          const sessionId = lines.find(l => l.startsWith('Session ID:'))?.split(': ')[1] || '';
          const patient = lines.find(l => l.startsWith('Patient:'))?.split(': ')[1] || '';
          const duration = lines.find(l => l.startsWith('Duration:'))?.split(': ')[1] || '';
          const dateStr = lines.find(l => l.startsWith('Date:'))?.split(': ')[1] || '';
          
          return {
            filename: file,
            sessionId,
            patient,
            duration,
            date: dateStr,
            createdAt: stats.ctime,
            size: stats.size
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      res.json(files);
    } catch (error) {
      console.error('Error fetching conversation logs:', error);
      res.status(500).json({ message: "Failed to fetch conversation logs" });
    }
  });
  
  app.get("/api/conversation-logs/:filename", async (req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const { filename } = req.params;
      const filepath = path.join(process.cwd(), 'conversation_logs', filename);
      
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "Conversation log not found" });
      }
      
      const content = fs.readFileSync(filepath, 'utf8');
      res.json({ content });
    } catch (error) {
      console.error('Error fetching conversation log:', error);
      res.status(500).json({ message: "Failed to fetch conversation log" });
    }
  });
  
  // Alerts endpoints
  app.get("/api/alerts/urgent", async (req, res) => {
    try {
      const alerts = await storage.getUnresolvedAlerts();
      const patients = await storage.getPatients();
      
      const urgentAlerts = alerts
        .filter(alert => alert.type === 'urgent')
        .map(alert => {
          const patient = patients.find(p => p.id === alert.patientId);
          return {
            ...alert,
            patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
            phoneNumber: patient?.phoneNumber || ''
          };
        });
      
      res.json(urgentAlerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch urgent alerts" });
    }
  });

  // Scheduled calls endpoints
  app.get("/api/calls/scheduled", async (req, res) => {
    try {
      const scheduledCalls = await storage.getPendingScheduledCalls();
      const patients = await storage.getPatients();
      
      const callsWithPatients = scheduledCalls.map(call => {
        const patient = patients.find(p => p.id === call.patientId);
        return {
          ...call,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
          phoneNumber: patient?.phoneNumber || ''
        };
      });
      
      res.json(callsWithPatients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scheduled calls" });
    }
  });

  app.post("/api/calls/schedule", async (req, res) => {
    try {
      const validatedData = insertScheduledCallSchema.parse(req.body);
      const scheduledCall = await storage.createScheduledCall(validatedData);
      res.json(scheduledCall);
    } catch (error) {
      res.status(400).json({ message: "Invalid scheduled call data" });
    }
  });

  // Voice Profile Management Endpoints
  app.get("/api/voice/profiles", (req, res) => {
    const profiles = voiceConfigManager.getAllProfiles();
    res.json(profiles);
  });

  app.get("/api/voice/profiles/:id", (req, res) => {
    const profile = voiceConfigManager.getProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Voice profile not found" });
    }
    res.json(profile);
  });

  app.post("/api/voice/profiles", (req, res) => {
    try {
      const profile = voiceConfigManager.createCustomProfile(req.body);
      res.json(profile);
    } catch (error) {
      res.status(400).json({ message: "Invalid voice profile data" });
    }
  });

  // Enhanced prompt testing endpoint
  app.post("/api/prompts/test", async (req, res) => {
    try {
      const { patientName, condition, callType, voiceProfileId } = req.body;
      
      const voiceProfile = voiceProfileId ? 
        voiceConfigManager.getProfile(voiceProfileId) : 
        voiceConfigManager.getProfileForCondition(condition);
      
      if (!voiceProfile) {
        return res.status(400).json({ message: "Invalid voice profile" });
      }

      const greeting = promptManager.generatePersonalizedGreeting(
        patientName,
        callType,
        voiceProfile.personality
      );

      const script = await openaiService.generateCallScript(
        patientName,
        condition,
        callType,
        voiceProfile.personality
      );

      res.json({
        greeting,
        script,
        voiceProfile: {
          name: voiceProfile.name,
          voice: voiceProfile.voice,
          personality: voiceProfile.personality
        },
        twiml: twilioService.generateTwiML(script, true, {
          voice: voiceProfile.voice,
          rate: voiceProfile.rate,
          pitch: voiceProfile.pitch,
          language: voiceProfile.language
        })
      });
    } catch (error) {
      console.error('Prompt test error:', error);
      res.status(500).json({ message: "Failed to generate test prompt" });
    }
  });

  // Twilio webhook endpoints for call processing
  app.post("/api/calls/webhook", async (req, res) => {
    try {
      console.log('📞 Twilio webhook received:', req.body.CallStatus);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).send('Error');
    }
  });

  app.post("/api/calls/twiml/:callId", async (req, res) => {
    try {
      const callId = parseInt(req.params.callId);
      console.log(`🎬 TWIML ENDPOINT - CALL ID: ${callId}`);
      
      const call = await storage.getCall(callId);
      if (!call) {
        console.log(`❌ Call not found: ${callId}`);
        return res.status(404).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Call not found</Say></Response>');
      }

      console.log(`📞 CALL FOUND: ${callId}`);
      
      const patient = await storage.getPatient(call.patientId);
      if (!patient) {
        console.log(`❌ Patient not found for call: ${callId}`);
        return res.status(404).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Patient not found</Say></Response>');
      }

      console.log(`👤 PATIENT FOUND: ${patient.firstName} ${patient.lastName}`);

      let script;
      if (call.customPrompt) {
        console.log(`🎯 USING CUSTOM PROMPT`);
        console.log(`📄 FIRST 50 CHARS: ${call.customPrompt.substring(0, 50)}`);
        script = call.customPrompt;
      } else {
        console.log(`🔄 USING DEFAULT PROMPT`);
        script = "Hello, this is CardioCare calling for your health check. How are you feeling today?";
      }

      console.log(`🎤 FINAL SCRIPT LENGTH: ${script.length}`);
      console.log(`🎤 OUTGOING PROMPT/GREETING: ${script}`);

      const voiceProfile = voiceConfigManager.getProfileForCondition(patient.condition);
      const twiml = twilioService.generateConversationalTwiML(script, callId, true);

      console.log(`📦 TWIML SENT: ${twiml.length} bytes to Twilio`);

      // Update call transcript
      const currentTranscript = call.transcript ? JSON.parse(call.transcript) : [];
      currentTranscript.push({
        speaker: 'ai',
        text: script,
        timestamp: new Date().toISOString()
      });

      await storage.updateCall(callId, {
        transcript: JSON.stringify(currentTranscript)
      });

      res.type('text/xml').send(twiml);
    } catch (error) {
      console.error('TwiML generation error:', error);
      res.status(500).type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Error processing call</Say></Response>');
    }
  });

  app.post("/api/calls/recording", async (req, res) => {
    try {
      console.log('🎙️ Recording received:', {
        CallSid: req.body.CallSid,
        RecordingUrl: req.body.RecordingUrl,
        RecordingDuration: req.body.RecordingDuration
      });

      console.log('💭 Processing recording and preparing for immediate response...');
      res.status(200).send('OK');
    } catch (error) {
      console.error('Recording processing error:', error);
      res.status(500).send('Error');
    }
  });

  app.post("/api/calls/transcription", async (req, res) => {
    try {
      const { CallSid, TranscriptionText, RecordingUrl } = req.body;
      
      console.log('Transcription received:', {
        CallSid,
        TranscriptionText,
        RecordingUrl
      });

      // Find the call by Twilio SID
      const calls = await storage.getCalls();
      const call = calls.find(c => c.twilioCallSid === CallSid);
      
      if (!call) {
        console.log(`Call not found for transcription SID: ${CallSid}`);
        return res.status(200).send('OK');
      }

      console.log(`Processing transcription with AI: ${TranscriptionText}`);

      // Get patient condition for analysis
      const patient = await storage.getPatient(call.patientId);
      const patientCondition = patient?.condition || 'general';
      
      // Analyze the patient response with AI
      const analysis = await openaiService.analyzePatientResponse(
        TranscriptionText,
        patientCondition
      );

      console.log('AI Analysis:', analysis);

      // Generate AI response
      const aiResponse = await openaiService.generateFollowUpResponse(
        analysis,
        TranscriptionText
      );

      console.log('AI Response:', aiResponse);

      // Update call transcript
      const currentTranscript = call.transcript ? JSON.parse(call.transcript) : [];
      currentTranscript.push({
        speaker: 'patient',
        recordingUrl: RecordingUrl,
        duration: req.body.RecordingDuration,
        timestamp: new Date().toISOString()
      });

      await storage.updateCall(call.id, {
        transcript: JSON.stringify(currentTranscript),
        aiAnalysis: analysis
      });

      console.log('Conversation analysis complete. Next question prepared:', aiResponse.substring(0, 80));

      res.status(200).send('OK');
    } catch (error) {
      console.error('Transcription processing error:', error);
      res.status(500).send('Error');
    }
  });

  // Patient prompt management endpoints
  app.get("/api/patients/:id/prompt", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id);
      
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      
      res.json({
        customPrompt: patient.customPrompt,
        promptMetadata: patient.promptMetadata
      });
    } catch (error) {
      console.error("Error fetching patient prompt:", error);
      res.status(500).json({ message: "Failed to fetch patient prompt" });
    }
  });

  app.put("/api/patients/:id/prompt", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { customPrompt, promptMetadata } = req.body;
      
      // Enhance the custom prompt with language preference metadata for GPT-4o parsing
      let enhancedPrompt = customPrompt;
      if (promptMetadata?.languagePreference && promptMetadata.languagePreference !== 'English') {
        // Add language instruction at the end of the prompt in a format the real-time service can parse
        enhancedPrompt += `\n\nLanguage Preference: ${promptMetadata.languagePreference}`;
      }
      
      const updatedPatient = await storage.updatePatient(id, {
        customPrompt: enhancedPrompt,
        promptMetadata
      });
      
      if (!updatedPatient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      
      res.json({
        success: true,
        message: "Patient prompt updated successfully",
        customPrompt: updatedPatient.customPrompt,
        promptMetadata: updatedPatient.promptMetadata
      });
    } catch (error) {
      console.error("Error updating patient prompt:", error);
      res.status(500).json({ message: "Failed to update patient prompt" });
    }
  });

  app.post("/api/patients/:id/test-prompt", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { customPrompt, promptMetadata } = req.body;
      
      const patient = await storage.getPatient(id);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      
      const validation = {
        isValid: true,
        length: customPrompt?.length || 0,
        hasGreeting: customPrompt?.toLowerCase().includes('hello') || customPrompt?.toLowerCase().includes('hi'),
        hasPatientName: customPrompt?.includes(patient.firstName) || customPrompt?.includes(patient.lastName),
        hasConditionReference: customPrompt?.toLowerCase().includes(patient.condition.toLowerCase()),
        estimatedDuration: promptMetadata?.conversationLength || 'standard'
      };
      
      res.json({
        success: true,
        result: validation.isValid ? 'Prompt validation passed' : 'Prompt needs improvement',
        validation,
        recommendations: [
          ...(validation.hasGreeting ? [] : ['Consider adding a warm greeting']),
          ...(validation.hasPatientName ? [] : ['Include patient name for personalization']),
          ...(validation.hasConditionReference ? [] : ['Reference patient condition for context'])
        ]
      });
    } catch (error) {
      console.error("Error testing patient prompt:", error);
      res.status(500).json({ message: "Failed to test patient prompt" });
    }
  });

  // Register prompt template management routes
  registerPromptTemplateRoutes(app);
  registerPatientPromptRoutes(app);
  registerCsvImportRoutes(app);

  return httpServer;
}