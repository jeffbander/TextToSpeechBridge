import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { openaiRealtimeService } from "./services/openai-realtime";
import { storage } from "./storage";

let realtimeWss: WebSocketServer | null = null;

export function registerRealtimeRoutes(app: Express, httpServer: Server) {
  console.log("[REALTIME] Initializing GPT-4o real-time routes");
  
  // Only create the WebSocket server once
  if (!realtimeWss) {
    realtimeWss = new WebSocketServer({
      port: 5001, // Use a different port for WebSocket
      host: '0.0.0.0'
    });

    realtimeWss.on('connection', (ws, req) => {
      console.log(`[REALTIME-WS] WebSocket connection established on port 5001`);
      console.log(`[REALTIME-WS] URL: ${req.url}`);
      
      try {
        const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
        const sessionId = url.searchParams.get('session');
        
        if (!sessionId) {
          console.log(`[REALTIME-WS] Connection rejected - no session ID`);
          ws.close(1000, 'Session ID required');
          return;
        }
        
        console.log(`[REALTIME-WS] Session connected: ${sessionId}`);
        
        // Send immediate confirmation
        ws.send(JSON.stringify({
          type: 'connection_established',
          sessionId,
          timestamp: new Date().toISOString()
        }));
        
        // Set up message handling
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log(`[REALTIME-WS] Received from client:`, message);
            
            // Handle test messages
            if (message.type === 'test') {
              ws.send(JSON.stringify({
                type: 'test_response',
                message: 'WebSocket connection working properly',
                timestamp: new Date().toISOString()
              }));
            }
          } catch (error) {
            console.error(`[REALTIME-WS] Message parse error:`, error);
          }
        });
        
        // Set up ping/pong for keepalive
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
        
        ws.on('pong', () => {
          console.log(`[REALTIME-WS] Pong received for session ${sessionId}`);
        });
        
        ws.on('close', (code, reason) => {
          clearInterval(pingInterval);
          console.log(`[REALTIME-WS] Connection closed for session ${sessionId}: ${code} ${reason}`);
        });
        
        ws.on('error', (error) => {
          console.error(`[REALTIME-WS] WebSocket error for session ${sessionId}:`, error);
        });
        
        // Connect to OpenAI realtime service
        openaiRealtimeService.connectClientWebSocket(sessionId, ws);
        
      } catch (error) {
        console.error(`[REALTIME-WS] Connection setup error:`, error);
        ws.close(1011, 'Internal server error');
      }
    });

    realtimeWss.on('error', (error) => {
      console.error(`[REALTIME-WS] WebSocket server error:`, error);
    });

    console.log(`[REALTIME] WebSocket server listening on port 5001`);
  }

  // GPT-4o real-time session management
  app.post("/api/realtime/session", async (req, res) => {
    try {
      const { patientId, patientName, callId } = req.body;
      
      if (!patientId || !patientName || !callId) {
        return res.status(400).json({ message: "Patient ID, name, and call ID are required" });
      }

      const sessionId = await openaiRealtimeService.createRealtimeSession(patientId, patientName, callId);
      
      // Return WebSocket URL on different port
      const isReplit = req.get('host')?.includes('replit.dev') || false;
      const protocol = isReplit ? 'wss' : 'ws';
      const currentHost = req.get('host') || 'localhost:5000';
      const wsHost = currentHost.replace(':5000', ':5001');
      
      res.json({
        sessionId,
        websocketUrl: `/?session=${sessionId}`,
        websocketHost: `${protocol}://${wsHost}`,
        status: "created"
      });
    } catch (error) {
      console.error("Error creating real-time session:", error);
      res.status(500).json({ message: "Failed to create real-time session" });
    }
  });

  // Get active real-time sessions
  app.get("/api/realtime/sessions", async (req, res) => {
    try {
      const sessions = openaiRealtimeService.getAllActiveSessions();
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching real-time sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // End a real-time session
  app.post("/api/realtime/session/:sessionId/end", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await openaiRealtimeService.endSession(sessionId);
      res.json({ message: "Session ended successfully" });
    } catch (error) {
      console.error("Error ending real-time session:", error);
      res.status(500).json({ message: "Failed to end session" });
    }
  });

  console.log("[REALTIME] GPT-4o real-time routes registered");
}