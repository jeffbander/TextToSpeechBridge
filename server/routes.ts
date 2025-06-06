import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { twilioService } from "./services/twilio";
import { openaiService } from "./services/openai";
import { sendGridService } from "./services/sendgrid";
import { insertPatientSchema, insertCallSchema, insertScheduledCallSchema, insertAlertSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Health check endpoint for public accessibility
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const activeConnections = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    activeConnections.add(ws);
    
    ws.on('close', () => {
      activeConnections.delete(ws);
    });
  });

  function broadcastUpdate(type: string, data: any) {
    const message = JSON.stringify({ type, data });
    activeConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Dashboard stats endpoint
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const patients = await storage.getPatients();
      const calls = await storage.getCalls();
      const activeCalls = await storage.getActiveCalls();
      const alerts = await storage.getUnresolvedAlerts();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const callsToday = calls.filter(call => 
        call.startedAt && call.startedAt >= today
      ).length;
      
      const completedToday = calls.filter(call => 
        call.status === 'completed' && 
        call.startedAt && call.startedAt >= today
      ).length;
      
      const successRate = callsToday > 0 ? (completedToday / callsToday * 100).toFixed(1) : '0.0';
      
      res.json({
        callsToday,
        urgentAlerts: alerts.filter(a => a.type === 'urgent').length,
        successRate: parseFloat(successRate),
        activePatients: patients.length,
        activeCalls: activeCalls.length,
        pendingCalls: (await storage.getPendingScheduledCalls()).length
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Get active calls with patient info
  app.get("/api/calls/active", async (req, res) => {
    try {
      const activeCalls = await storage.getActiveCalls();
      const patients = await storage.getPatients();
      
      const callsWithPatients = activeCalls.map(call => {
        const patient = patients.find(p => p.id === call.patientId);
        return {
          ...call,
          patientName: patient?.name || 'Unknown',
          phoneNumber: patient?.phoneNumber || '',
          condition: patient?.condition || ''
        };
      });
      
      res.json(callsWithPatients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch active calls" });
    }
  });

  // Get recent calls
  app.get("/api/calls/recent", async (req, res) => {
    try {
      const calls = await storage.getCalls();
      const patients = await storage.getPatients();
      
      const recentCalls = calls
        .filter(call => call.status !== 'active')
        .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0))
        .slice(0, 20)
        .map(call => {
          const patient = patients.find(p => p.id === call.patientId);
          return {
            ...call,
            patientName: patient?.name || 'Unknown',
            phoneNumber: patient?.phoneNumber || '',
            condition: patient?.condition || ''
          };
        });
      
      res.json(recentCalls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent calls" });
    }
  });

  // Start a new call
  app.post("/api/calls/start", async (req, res) => {
    try {
      const { patientId, callType } = req.body;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Check for existing active calls
      const activeCalls = await storage.getActiveCallsByPatientId(patientId);
      if (activeCalls.length > 0) {
        return res.status(400).json({ message: "Patient already has an active call" });
      }

      // Generate AI script for the call
      const script = await openaiService.generateCallScript(
        patient.name, 
        patient.condition, 
        callType
      );

      // Create call record
      const call = await storage.createCall({
        patientId,
        status: 'active',
        outcome: null,
        transcript: '',
        aiAnalysis: null,
        alertLevel: 'none',
        duration: null,
        twilioCallSid: null
      });

      // Initiate Twilio call - use current Replit domain for webhooks
      const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
        `https://${process.env.REPLIT_DEV_DOMAIN}` : 
        'https://fe1cf261-06d9-4ef6-9ad5-17777e1affd0-00-2u5ajlr2fy6bm.riker.replit.dev';
      
      const callbackUrl = `${baseUrl}/api/calls/webhook`;
      
      try {
        const webhookUrl = `${baseUrl}/api/calls/twiml/${call.id}`;
        console.log('🚀 INITIATING TWILIO CALL with webhook URL:', webhookUrl);
        console.log('📞 Calling patient:', patient.phoneNumber);
        
        const twilioCallSid = await twilioService.makeCall({
          to: patient.phoneNumber,
          url: webhookUrl,
          statusCallback: callbackUrl
        });
        
        console.log('✅ Twilio call created with SID:', twilioCallSid);

        await storage.updateCall(call.id, { twilioCallSid });
        
        broadcastUpdate('callStarted', { call: { ...call, patientName: patient.name } });
        
        res.json({ 
          success: true, 
          callId: call.id, 
          twilioSid: twilioCallSid,
          script 
        });
      } catch (twilioError) {
        await storage.updateCall(call.id, { status: 'failed' });
        throw twilioError;
      }
    } catch (error) {
      console.error('Start call error:', error);
      res.status(500).json({ message: "Failed to start call" });
    }
  });

  // End a call
  app.post("/api/calls/:id/end", async (req, res) => {
    try {
      const callId = parseInt(req.params.id);
      const call = await storage.getCall(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      if (call.twilioCallSid) {
        await twilioService.endCall(call.twilioCallSid);
      }

      const duration = call.startedAt ? 
        Math.floor((Date.now() - call.startedAt.getTime()) / 1000) : 0;

      await storage.updateCall(callId, { 
        status: 'completed',
        duration,
        completedAt: new Date()
      });

      broadcastUpdate('callEnded', { callId });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to end call" });
    }
  });

  // Test OpenAI endpoint
  app.post("/api/test-openai", async (req, res) => {
    try {
      const { text } = req.body;
      const analysis = await openaiService.analyzePatientResponse(
        text,
        "general health",
        []
      );
      res.json({ success: true, analysis });
    } catch (error) {
      console.error('OpenAI test failed:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'OpenAI API not working'
      });
    }
  });

  // TwiML endpoint removed - now handled in server/index.ts to prevent routing conflicts

  // Handle voice recordings from Twilio calls
  app.post("/api/calls/recording", async (req, res) => {
    try {
      const { CallSid, RecordingUrl, RecordingDuration } = req.body;
      console.log('Recording received:', { CallSid, RecordingUrl, RecordingDuration });

      // Find the active call
      const calls = await storage.getCalls();
      const call = calls.find(c => c.twilioCallSid === CallSid && c.status === 'active');
      
      if (!call) {
        console.log('Call not found for recording SID:', CallSid);
        res.type('text/xml');
        res.send(twilioService.generateTwiML("Thank you for calling. Goodbye.", false));
        return;
      }

      // Store recording URL for processing
      await storage.updateCall(call.id, {
        transcript: JSON.stringify([{ 
          speaker: 'patient', 
          recordingUrl: RecordingUrl,
          duration: RecordingDuration,
          timestamp: new Date()
        }])
      });

      res.type('text/xml');
      res.send(twilioService.generateTwiML("Thank you for your response. Please hold while I analyze your information.", false));
    } catch (error: any) {
      console.error('Recording processing error:', error);
      res.type('text/xml');
      res.send(twilioService.generateTwiML("Thank you for calling. Goodbye.", false));
    }
  });

  // Handle transcription callbacks from Twilio
  app.post("/api/calls/transcription", async (req, res) => {
    try {
      const { CallSid, TranscriptionText, RecordingUrl } = req.body;
      console.log('Transcription received:', { CallSid, TranscriptionText, RecordingUrl });

      if (!TranscriptionText || TranscriptionText.trim() === '') {
        console.log('No transcription text received');
        res.status(200).send('OK');
        return;
      }

      // Find call by Twilio SID
      const calls = await storage.getCalls();
      const call = calls.find(c => c.twilioCallSid === CallSid);
      
      if (!call) {
        console.log('Call not found for transcription SID:', CallSid);
        res.status(200).send('OK');
        return;
      }

      const patient = await storage.getPatient(call.patientId);
      if (!patient) {
        console.log('Patient not found for call:', call.id);
        res.status(200).send('OK');
        return;
      }

      // Parse existing transcript
      const transcriptHistory = call.transcript ? 
        JSON.parse(call.transcript) as any[] : [];

      // Add patient response to transcript
      transcriptHistory.push({
        speaker: 'patient',
        text: TranscriptionText,
        recordingUrl: RecordingUrl,
        timestamp: new Date()
      });

      // Process with AI
      try {
        console.log('Processing transcription with AI:', TranscriptionText);
        
        const analysis = await openaiService.analyzePatientResponse(
          TranscriptionText,
          patient.condition || 'general health',
          transcriptHistory
        );

        const aiResponse = await openaiService.generateFollowUpResponse(
          analysis,
          patient.condition || 'general health'
        );

        // Add AI response to transcript
        transcriptHistory.push({
          speaker: 'ai',
          text: aiResponse,
          timestamp: new Date()
        });

        // Update call record with AI analysis
        await storage.updateCall(call.id, {
          transcript: JSON.stringify(transcriptHistory),
          aiAnalysis: analysis as any,
          alertLevel: analysis.urgencyLevel === 'critical' || analysis.urgencyLevel === 'high' ? 'urgent' : 
                     analysis.urgencyLevel === 'medium' ? 'warning' : 'none'
        });

        // Create alert if needed
        if (analysis.escalateToProvider) {
          await storage.createAlert({
            patientId: call.patientId,
            callId: call.id,
            type: analysis.urgencyLevel === 'critical' ? 'urgent' : 'warning',
            message: analysis.summary
          });
        }

        // Broadcast real-time update
        broadcastUpdate('callUpdated', { 
          callId: call.id, 
          transcript: transcriptHistory,
          analysis: analysis
        });

        console.log('Transcription processed successfully with AI analysis');

      } catch (aiError: any) {
        console.log('AI processing failed for transcription:', aiError.message);
        
        // Update with basic transcript
        await storage.updateCall(call.id, {
          transcript: JSON.stringify(transcriptHistory),
          alertLevel: 'none'
        });
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('Transcription processing error:', error);
      res.status(200).send('OK');
    }
  });

  // Process speech input from Twilio with proper call handling
  app.post("/api/calls/process-speech", async (req, res) => {
    try {
      const { SpeechResult, CallSid } = req.body;
      console.log('Processing speech:', { SpeechResult, CallSid });
      
      if (!SpeechResult || SpeechResult.trim() === '') {
        console.log('No speech result received');
        res.type('text/xml');
        res.send(twilioService.generateTwiML("I didn't catch that. Could you please repeat your response?"));
        return;
      }

      // Find call by Twilio SID - check all calls including recent ones
      const calls = await storage.getCalls();
      let call = calls.find(c => c.twilioCallSid === CallSid);
      
      // If call not found, create a temporary call record for this session
      if (!call) {
        console.log('Call not found for SID:', CallSid, 'Creating temporary call record');
        
        // Create a basic call record for speech processing
        const tempCall = await storage.createCall({
          patientId: 1, // Use default patient for unmatched calls
          status: 'active',
          twilioCallSid: CallSid
        });
        call = tempCall;
      }

      const patient = await storage.getPatient(call.patientId);
      if (!patient) {
        console.log('Patient not found for call:', call.id);
        res.type('text/xml');
        res.send(twilioService.generateTwiML("Thank you for calling. Goodbye."));
        return;
      }

      // Parse existing transcript
      const transcriptHistory = call.transcript ? 
        JSON.parse(call.transcript) as any[] : [];

      // Add patient response to transcript
      transcriptHistory.push({
        speaker: 'patient',
        text: SpeechResult,
        timestamp: new Date()
      });

      // Use OpenAI for intelligent conversation when available
      try {
        console.log('Attempting OpenAI analysis for:', SpeechResult);
        
        const analysis = await openaiService.analyzePatientResponse(
          SpeechResult,
          patient.condition || 'general health',
          transcriptHistory
        );

        const aiResponse = await openaiService.generateFollowUpResponse(
          analysis,
          patient.condition || 'general health'
        );

        // Add AI response to transcript
        transcriptHistory.push({
          speaker: 'ai',
          text: aiResponse,
          timestamp: new Date()
        });

        // Update call record with AI analysis
        await storage.updateCall(call.id, {
          transcript: JSON.stringify(transcriptHistory),
          aiAnalysis: analysis as any,
          alertLevel: analysis.urgencyLevel === 'critical' || analysis.urgencyLevel === 'high' ? 'urgent' : 
                     analysis.urgencyLevel === 'medium' ? 'warning' : 'none'
        });

        // Create alert if needed
        if (analysis.escalateToProvider) {
          await storage.createAlert({
            patientId: call.patientId,
            callId: call.id,
            type: analysis.urgencyLevel === 'critical' ? 'urgent' : 'warning',
            message: analysis.summary
          });
        }

        // Continue conversation or end call
        let twimlResponse: string;
        if (analysis.urgencyLevel === 'critical') {
          twimlResponse = `${aiResponse} A healthcare provider will contact you shortly. Please stay by your phone. Goodbye.`;
        } else if (analysis.nextQuestions.length === 0) {
          twimlResponse = `${aiResponse} Thank you for your time. Take care and have a great day. Goodbye.`;
        } else {
          twimlResponse = `${aiResponse} ${analysis.nextQuestions[0]}`;
        }

        console.log('AI processing successful, responding with:', twimlResponse);
        res.type('text/xml');
        res.send(twilioService.generateTwiML(twimlResponse));

      } catch (aiError) {
        console.log('OpenAI processing failed, using fallback:', aiError.message);
        
        // Fallback to simple health check questions
        const patientResponses = transcriptHistory.filter(t => t.speaker === 'patient').length;
        let response: string;
        
        if (patientResponses === 1) {
          response = "Thank you for sharing that. Have you been taking your medications as prescribed?";
        } else if (patientResponses === 2) {
          response = "Good. Are you experiencing any pain, shortness of breath, or other concerning symptoms?";
        } else if (patientResponses === 3) {
          response = "I understand. Have you been following your discharge instructions and attending follow-up appointments?";
        } else {
          response = "Thank you for your responses. Please continue taking care of yourself. A healthcare provider will contact you if needed. Have a great day. Goodbye.";
        }
        
        // Add response to transcript
        transcriptHistory.push({
          speaker: 'ai',
          text: response,
          timestamp: new Date()
        });

        // Update call record
        await storage.updateCall(call.id, {
          transcript: JSON.stringify(transcriptHistory),
          alertLevel: 'none'
        });

        res.type('text/xml');
        res.send(twilioService.generateTwiML(response));
      }

      // Broadcast real-time update
      broadcastUpdate('callUpdated', { 
        callId: call.id, 
        transcript: transcriptHistory 
      });

    } catch (error) {
      console.error('Speech processing error:', error);
      res.type('text/xml');
      res.send(twilioService.generateTwiML("I'm having technical difficulties. A nurse will call you back. Goodbye."));
    }
  });

  // Get urgent alerts
  app.get("/api/alerts/urgent", async (req, res) => {
    try {
      const alerts = await storage.getUnresolvedAlerts();
      const patients = await storage.getPatients();
      
      const alertsWithPatients = alerts.map(alert => {
        const patient = patients.find(p => p.id === alert.patientId);
        return {
          ...alert,
          patientName: patient?.name || 'Unknown',
          phoneNumber: patient?.phoneNumber || ''
        };
      });
      
      res.json(alertsWithPatients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch urgent alerts" });
    }
  });

  // Get scheduled calls
  app.get("/api/calls/scheduled", async (req, res) => {
    try {
      const scheduledCalls = await storage.getPendingScheduledCalls();
      const patients = await storage.getPatients();
      
      const callsWithPatients = scheduledCalls.map(call => {
        const patient = patients.find(p => p.id === call.patientId);
        return {
          ...call,
          patientName: patient?.name || 'Unknown',
          phoneNumber: patient?.phoneNumber || ''
        };
      });
      
      res.json(callsWithPatients);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scheduled calls" });
    }
  });

  // Add new patient
  app.post("/api/patients", async (req, res) => {
    try {
      const validatedData = insertPatientSchema.parse(req.body);
      const patient = await storage.createPatient(validatedData);
      res.json(patient);
    } catch (error) {
      res.status(400).json({ message: "Invalid patient data" });
    }
  });

  // Schedule a call
  app.post("/api/calls/schedule", async (req, res) => {
    try {
      const validatedData = insertScheduledCallSchema.parse(req.body);
      const scheduledCall = await storage.createScheduledCall(validatedData);
      res.json(scheduledCall);
    } catch (error) {
      res.status(400).json({ message: "Invalid scheduled call data" });
    }
  });

  // Batch call initiation
  app.post("/api/calls/batch", async (req, res) => {
    try {
      const { patientIds, callType } = req.body;
      
      if (!Array.isArray(patientIds) || patientIds.length === 0) {
        return res.status(400).json({ message: "Patient IDs array required" });
      }

      const results = [];
      
      for (const patientId of patientIds) {
        try {
          const patient = await storage.getPatient(patientId);
          if (!patient) continue;

          const activeCalls = await storage.getActiveCallsByPatientId(patientId);
          if (activeCalls.length > 0) continue;

          const call = await storage.createCall({
            patientId,
            status: 'active',
            outcome: null,
            transcript: '',
            aiAnalysis: null,
            alertLevel: 'none',
            duration: null,
            twilioCallSid: null
          });

          results.push({ patientId, callId: call.id, status: 'initiated' });
        } catch (error: any) {
          results.push({ patientId, status: 'failed', error: error.message });
        }
      }

      res.json({ results, total: results.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to start batch calls" });
    }
  });

  return httpServer;
}
