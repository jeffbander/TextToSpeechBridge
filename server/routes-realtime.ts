import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { openaiRealtimeService } from "./services/openai-realtime";
import { storage } from "./storage";
import url from 'url';

let realtimeWss: WebSocketServer | null = null;

export function registerRealtimeRoutes(app: Express, httpServer: Server) {
  console.log("[REALTIME] Initializing GPT-4o real-time routes");
  
  // Use WebSocket server with noServer mode and manual upgrade handling
  if (!realtimeWss) {
    realtimeWss = new WebSocketServer({ noServer: true });
    
    // Store original upgrade handler if it exists
    const originalUpgrade = httpServer.listeners('upgrade');
    httpServer.removeAllListeners('upgrade');
    
    // Handle upgrade requests with path filtering
    httpServer.on('upgrade', (request, socket, head) => {
      const pathname = url.parse(request.url!).pathname;
      console.log(`[REALTIME] WebSocket upgrade request for: ${pathname}`);
      
      if (pathname === '/ws/realtime') {
        console.log('[REALTIME] Handling realtime WebSocket upgrade');
        realtimeWss!.handleUpgrade(request, socket, head, (websocket) => {
          realtimeWss!.emit('connection', websocket, request);
        });
      } else {
        // Let other upgrade handlers (like Vite HMR) handle their requests
        for (const handler of originalUpgrade) {
          if (typeof handler === 'function') {
            handler.call(httpServer, request, socket, head);
          }
        }
      }
    });
    
    console.log(`[REALTIME] WebSocket server configured for /ws/realtime path with manual upgrade`);

    realtimeWss.on('connection', (ws, req) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}][REALTIME-WS] NEW CONNECTION on /realtime path`);
      console.log(`[${timestamp}][REALTIME-WS] Headers:`, JSON.stringify(req.headers, null, 2));
      console.log(`[${timestamp}][REALTIME-WS] URL: ${req.url}`);
      console.log(`[${timestamp}][REALTIME-WS] Socket state: ${ws.readyState}`);
      
      try {
        const url = new URL(req.url!, `http://${req.headers.host || 'localhost'}`);
        const sessionId = url.searchParams.get('session');
        
        if (!sessionId) {
          console.log(`[${timestamp}][REALTIME-WS] ❌ REJECTED - no session ID`);
          ws.close(1000, 'Session ID required');
          return;
        }
        
        console.log(`[${timestamp}][REALTIME-WS] ✅ SESSION CONNECTED: ${sessionId}`);
        
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
          const closeTime = new Date().toISOString();
          console.log(`[${closeTime}][REALTIME-WS] 🔌 CONNECTION CLOSED for ${sessionId}`);
          console.log(`[${closeTime}][REALTIME-WS] Close code: ${code}`);
          console.log(`[${closeTime}][REALTIME-WS] Close reason: ${reason.toString()}`);
          console.log(`[${closeTime}][REALTIME-WS] Was clean close: ${code === 1000}`);
        });
        
        ws.on('error', (error) => {
          const errorTime = new Date().toISOString();
          console.error(`[${errorTime}][REALTIME-WS] ❌ WEBSOCKET ERROR for ${sessionId}:`);
          console.error(`[${errorTime}][REALTIME-WS] Error type: ${error.name}`);
          console.error(`[${errorTime}][REALTIME-WS] Error message: ${error.message}`);
          console.error(`[${errorTime}][REALTIME-WS] Error stack:`, error.stack);
          console.error(`[${errorTime}][REALTIME-WS] Socket state: ${ws.readyState}`);
        });
        
        // Connect to OpenAI realtime service (OpenAI initialization happens automatically)
        openaiRealtimeService.connectClientWebSocket(sessionId, ws);
        
      } catch (error) {
        console.error(`[REALTIME-WS] Connection setup error:`, error);
        ws.close(1011, 'Internal server error');
      }
    });

    realtimeWss.on('error', (error) => {
      console.error(`[REALTIME-WS] WebSocket server error:`, error);
    });

    realtimeWss.on('headers', (headers, request) => {
      console.log(`[REALTIME-WS] Response headers:`, headers);
    });

    console.log(`[REALTIME] WebSocket server configured for /realtime path`);
  }

  // GPT-4o real-time session management
  app.post("/api/realtime/session", async (req, res) => {
    try {
      const { patientId, patientName, callId } = req.body;
      
      if (!patientId || !patientName || !callId) {
        return res.status(400).json({ message: "Patient ID, name, and call ID are required" });
      }

      const sessionId = await openaiRealtimeService.createRealtimeSession(patientId, patientName, callId);
      
      // Return WebSocket URL - use dedicated port for WebSocket
      const isReplit = req.get('host')?.includes('replit.dev') || false;
      const protocol = isReplit ? 'wss' : 'ws';
      const currentHost = req.get('host') || 'localhost:5000';
      
      // Use dedicated WebSocket port
      const baseHost = currentHost.split(':')[0];
      const wsHost = `${baseHost}:8080`;
      
      res.json({
        sessionId,
        websocketUrl: `?session=${sessionId}`,
        websocketHost: `${protocol}://${currentHost}`,
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