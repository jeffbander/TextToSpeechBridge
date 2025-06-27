import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { twilioService } from "./services/twilio";
import { openaiService } from "./services/openai";
import { sendGridService } from "./services/sendgrid";
import { voiceConfigManager } from "./services/voice-config";
import { promptManager } from "./services/prompt-manager";
import { insertPatientSchema, insertCallSchema, insertScheduledCallSchema, insertAlertSchema } from "@shared/schema";

export function registerCallingRoutes(app: Express, httpServer: Server) {
  console.log("[CALLING] Initializing standard calling routes");
  
  // Dedicated WebSocket server for standard calling updates only
  const callingWss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  const activeConnections = new Set<WebSocket>();

  callingWss.on('connection', (ws) => {
    console.log(`[CALLING-WS] Standard calling WebSocket connection established. Total connections: ${activeConnections.size + 1}`);
    activeConnections.add(ws);
    
    ws.on('close', () => {
      activeConnections.delete(ws);
      console.log(`[CALLING-WS] Standard calling WebSocket connection closed. Total connections: ${activeConnections.size}`);
    });
    
    ws.on('error', (error) => {
      console.error(`[CALLING-WS] Standard calling WebSocket error:`, error);
    });
  });

  function broadcastUpdate(type: string, data: any) {
    console.log(`[CALLING-BROADCAST] Sending update: ${type} to ${activeConnections.size} connections`);
    const message = JSON.stringify({ type, data });
    activeConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  // Patient endpoints
  app.get("/api/patients", async (req, res) => {
    console.log(`[API] GET /api/patients - ${new Date().toISOString()}`);
    try {
      const patients = await storage.getPatients();
      console.log(`[API] Patients fetched: ${patients.length} records`);
      res.json(patients);
    } catch (error) {
      console.error(`[API] Error fetching patients:`, error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  app.post("/api/patients", async (req, res) => {
    try {
      const result = insertPatientSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid patient data", 
          errors: result.error.errors 
        });
      }
      
      const patient = await storage.createPatient(result.data);
      res.json(patient);
    } catch (error) {
      res.status(500).json({ message: "Failed to create patient" });
    }
  });

  app.put("/api/patients/:id", async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      if (isNaN(patientId)) {
        return res.status(400).json({ message: "Invalid patient ID" });
      }

      const result = insertPatientSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid patient data", 
          errors: result.error.errors 
        });
      }
      
      const updatedPatient = await storage.updatePatient(patientId, result.data);
      if (!updatedPatient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      
      res.json(updatedPatient);
    } catch (error) {
      console.error(`[API] Error updating patient:`, error);
      res.status(500).json({ message: "Failed to update patient" });
    }
  });

  // Dashboard stats endpoint
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const patients = await storage.getPatients();
      const calls = await storage.getCalls();
      const activeCalls = await storage.getActiveCalls();
      const alerts = await storage.getUnresolvedAlerts();
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const callsToday = calls.filter(call => {
        if (!call.startedAt) return false;
        const callDate = new Date(call.startedAt);
        return callDate >= today;
      }).length;
      
      const completedToday = calls.filter(call => {
        if (!call.startedAt || call.status !== 'completed') return false;
        const callDate = new Date(call.startedAt);
        return callDate >= today;
      }).length;
      
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
      console.error('Dashboard stats error:', error);
      res.status(500).json({ message: "Failed to fetch dashboard stats", error: error instanceof Error ? error.message : String(error) });
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
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
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
            patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
            phoneNumber: patient?.phoneNumber || '',
            condition: patient?.condition || ''
          };
        });
      
      res.json(recentCalls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent calls" });
    }
  });

  // EMERGENCY KILL SWITCH - Stop all active calls immediately
  app.post("/api/calls/emergency-stop", async (req, res) => {
    try {
      console.log(`[EMERGENCY-KILL-SWITCH] Emergency stop initiated at ${new Date().toISOString()}`);
      
      // Get all active calls
      const activeCalls = await storage.getActiveCalls();
      console.log(`[EMERGENCY-KILL-SWITCH] Found ${activeCalls.length} active calls to terminate`);
      
      const killResults = [];
      let successCount = 0;
      let errorCount = 0;
      
      // Terminate each active call
      for (const call of activeCalls) {
        try {
          console.log(`[EMERGENCY-KILL-SWITCH] Terminating call ${call.id} for patient ${call.patientId}`);
          
          // Update call status to failed with emergency stop reason
          await storage.updateCall(call.id, { 
            status: 'failed'
          });
          
          killResults.push({
            callId: call.id,
            patientId: call.patientId,
            status: 'terminated',
            reason: 'emergency_stop'
          });
          
          successCount++;
          
          // Broadcast call ended update
          broadcastUpdate('callEnded', { 
            callId: call.id, 
            reason: 'emergency_stop',
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          console.error(`[EMERGENCY-KILL-SWITCH] Failed to terminate call ${call.id}:`, error);
          killResults.push({
            callId: call.id,
            patientId: call.patientId,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
          });
          errorCount++;
        }
      }
      
      console.log(`[EMERGENCY-KILL-SWITCH] Emergency stop completed: ${successCount} terminated, ${errorCount} errors`);
      
      res.json({
        success: true,
        message: `Emergency stop completed: ${successCount} calls terminated, ${errorCount} errors`,
        totalCalls: activeCalls.length,
        successCount,
        errorCount,
        timestamp: new Date().toISOString(),
        results: killResults
      });
      
    } catch (error) {
      console.error("[EMERGENCY-KILL-SWITCH] Emergency stop failed:", error);
      res.status(500).json({ 
        success: false,
        message: "Emergency stop failed", 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Start a new call
  app.post("/api/calls/start", async (req, res) => {
    try {
      const { patientId, callType, customPrompt } = req.body;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Check for existing active calls
      const activeCalls = await storage.getActiveCallsByPatientId(patientId);
      if (activeCalls.length > 0) {
        return res.status(400).json({ message: "Patient already has an active call" });
      }

      // Get optimal voice profile for patient's condition
      const voiceProfile = voiceConfigManager.getProfileForCondition(patient.condition);
      
      // Generate AI script with voice personality or use custom prompt
      let script;
      if (customPrompt) {
        script = customPrompt;
      } else {
        script = await openaiService.generateCallScript(
          `${patient.firstName} ${patient.lastName}`, 
          patient.condition, 
          callType,
          voiceProfile.personality
        );
      }

      console.log('💾 STORING CUSTOM PROMPT IN CALL RECORD:', customPrompt ? 'YES' : 'NO');
      if (customPrompt) {
        console.log('📝 CUSTOM PROMPT TEXT:', customPrompt);
      }
      
      const call = await storage.createCall({
        patientId,
        status: 'active',
        outcome: null,
        transcript: '',
        aiAnalysis: null,
        alertLevel: 'none',
        duration: null,
        twilioCallSid: null,
        customPrompt: customPrompt || null
      });

      // Initiate Twilio call
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
        
        broadcastUpdate('callStarted', { call: { ...call, patientName: `${patient.firstName} ${patient.lastName}` } });
        
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

  console.log("[CALLING] Standard calling routes registered");
}