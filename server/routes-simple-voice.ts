import { Express } from 'express';
import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { simpleVoiceService } from './services/simple-voice.js';

export function registerSimpleVoiceRoutes(app: Express, httpServer: Server) {
  console.log('[SIMPLE-VOICE] Initializing simple voice routes');

  // WebSocket server for simple voice sessions
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/simple-voice'
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const sessionId = url.searchParams.get('session');
    
    if (!sessionId) {
      ws.close(1008, 'Session ID required');
      return;
    }

    console.log(`🔗 Simple voice WebSocket connected for session ${sessionId}`);
    simpleVoiceService.connectWebSocket(sessionId, ws);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        simpleVoiceService.handleTwilioMessage(sessionId, message);
      } catch (error) {
        console.error('Error parsing simple voice message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`🔗 Simple voice WebSocket disconnected for session ${sessionId}`);
    });
  });

  // Create simple voice session
  app.post('/api/simple-voice/session', async (req, res) => {
    try {
      const { patientId, patientName, callId } = req.body;
      
      if (!patientId || !patientName || !callId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const sessionId = await simpleVoiceService.createSession(patientId, patientName, callId);
      
      res.json({
        sessionId,
        websocketUrl: `/simple-voice?session=${sessionId}`,
        websocketHost: `ws://localhost:${process.env.PORT || 5000}`,
        status: 'created'
      });
    } catch (error) {
      console.error('Error creating simple voice session:', error);
      res.status(500).json({ error: 'Failed to create session' });
    }
  });

  // Get active simple voice sessions
  app.get('/api/simple-voice/sessions', (req, res) => {
    try {
      const sessions = simpleVoiceService.getAllSessions();
      res.json(sessions);
    } catch (error) {
      console.error('Error getting simple voice sessions:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });

  // Get specific session
  app.get('/api/simple-voice/session/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = simpleVoiceService.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      res.json(session);
    } catch (error) {
      console.error('Error getting simple voice session:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  // End session
  app.delete('/api/simple-voice/session/:sessionId', (req, res) => {
    try {
      const { sessionId } = req.params;
      simpleVoiceService.endSession(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error ending simple voice session:', error);
      res.status(500).json({ error: 'Failed to end session' });
    }
  });

  console.log('[SIMPLE-VOICE] Simple voice routes registered');
}