import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { openaiRealtimeService } from "./services/openai-realtime";
import { storage } from "./storage";

export function registerRealtimeRoutes(app: Express, httpServer: Server) {
  console.log("[REALTIME] Initializing GPT-4o real-time routes");
  
  // Dedicated WebSocket server for GPT-4o real-time preview only
  const realtimeWss = new WebSocketServer({ 
    server: httpServer, 
    path: '/realtime',
    clientTracking: true
  });

  // Handle GPT-4o real-time connections
  realtimeWss.on('connection', (ws, req) => {
    console.log(`[REALTIME-WS] GPT-4o real-time connection established`);
    
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('session');
      
      if (!sessionId) {
        console.log(`[REALTIME-WS] Connection rejected - no session ID`);
        ws.close(1000, 'Session ID required');
        return;
      }
      
      console.log(`[REALTIME-WS] Connecting session: ${sessionId}`);
      
      // Send immediate confirmation
      ws.send(JSON.stringify({
        type: 'connection_established',
        sessionId,
        timestamp: new Date().toISOString()
      }));
      
      openaiRealtimeService.connectClientWebSocket(sessionId, ws);
      
    } catch (error) {
      console.error(`[REALTIME-WS] Connection error:`, error);
      ws.close(1011, 'Internal server error');
    }
  });

  realtimeWss.on('error', (error) => {
    console.error(`[REALTIME-WS] WebSocket server error:`, error);
  });

  // GPT-4o real-time session management
  app.post("/api/realtime/session", async (req, res) => {
    try {
      const { patientId, patientName, callId } = req.body;
      
      if (!patientId || !patientName || !callId) {
        return res.status(400).json({ message: "Patient ID, name, and call ID are required" });
      }

      const sessionId = await openaiRealtimeService.createRealtimeSession(patientId, patientName, callId);
      
      res.json({
        sessionId,
        websocketUrl: `/realtime?session=${sessionId}`,
        status: "created"
      });
    } catch (error) {
      console.error("Error creating real-time session:", error);
      res.status(500).json({ message: "Failed to create real-time session" });
    }
  });

  // Get active real-time sessions
  app.get("/api/realtime/sessions", (req, res) => {
    try {
      const activeSessions = openaiRealtimeService.getAllActiveSessions();
      res.json(activeSessions);
    } catch (error) {
      console.error("Error fetching real-time sessions:", error);
      res.status(500).json({ message: "Failed to fetch real-time sessions" });
    }
  });

  // End a real-time session
  app.post("/api/realtime/sessions/:sessionId/end", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await openaiRealtimeService.endSession(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error ending real-time session:", error);
      res.status(500).json({ message: "Failed to end real-time session" });
    }
  });

  console.log("[REALTIME] GPT-4o real-time routes registered");
}