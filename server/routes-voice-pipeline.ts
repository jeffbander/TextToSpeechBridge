import { Router } from 'express';
import { WebSocketServer } from 'ws';
import { voicePipelineService } from './services/voice-pipeline.js';
import { storage } from './storage.js';

export function createVoicePipelineRoutes(app: any, server: any) {
  const router = Router();

  // WebSocket server for voice pipeline
  const voiceWss = new WebSocketServer({ 
    noServer: true,
    path: '/ws/voice-pipeline'
  });

  // Handle WebSocket upgrades for voice pipeline
  server.on('upgrade', (request: any, socket: any, head: any) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    if (pathname?.startsWith('/ws/voice-pipeline/')) {
      console.log(`[VOICE-PIPELINE] Handling WebSocket upgrade for path: ${pathname}`);
      const sessionId = pathname.split('/ws/voice-pipeline/')[1];
      console.log(`[VOICE-PIPELINE] Extracted session ID: ${sessionId}`);
      
      voiceWss.handleUpgrade(request, socket, head, (websocket) => {
        console.log(`[VOICE-PIPELINE] WebSocket upgraded successfully for session: ${sessionId}`);
        handleVoiceWebSocket(websocket, sessionId);
      });
    }
  });

  // Store WebSocket connections for audio output
  const activeConnections = new Map<string, any>();

  function handleVoiceWebSocket(ws: any, sessionId: string) {
    console.log(`🎤 Voice WebSocket connected for session ${sessionId}`);
    
    // Store the connection for audio output
    activeConnections.set(sessionId, ws);

    // Set up audio output polling for this session
    const audioInterval = setInterval(() => {
      const queuedAudio = voicePipelineService.getQueuedAudio(sessionId);
      if (queuedAudio) {
        sendTwilioMessage(ws, {
          event: 'media',
          media: {
            payload: queuedAudio.toString('base64')
          }
        });
      }
    }, 100); // Check for queued audio every 100ms

    ws.on('message', async (data: any) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Voice message for ${sessionId}:`, message.event);

        switch (message.event) {
          case 'connected':
            console.log(`🔗 Voice session ${sessionId} connected`);
            break;

          case 'start':
            console.log(`▶️ Voice session ${sessionId} started`);
            // Initialize the voice pipeline session
            // For now, find the call by extracting the call ID from the session ID
            const callId = parseInt(sessionId.split('_')[1]) || 0;
            const call = await storage.getCall(callId);
            if (call) {
              await voicePipelineService.createSession(sessionId, call.patientId, call.id);
              
              // Send initial greeting
              setTimeout(() => {
                sendTwilioMessage(ws, {
                  event: 'media',
                  media: {
                    payload: createInitialGreeting()
                  }
                });
              }, 1000);
            }
            break;

          case 'media':
            // Process incoming audio
            if (message.media && message.media.payload) {
              const audioData = Buffer.from(message.media.payload, 'base64');
              await voicePipelineService.processAudioChunk(sessionId, audioData);
            }
            break;

          case 'stop':
            console.log(`🛑 Voice session ${sessionId} stopped`);
            voicePipelineService.endSession(sessionId);
            break;
        }
      } catch (error) {
        console.error(`❌ Error processing voice message for ${sessionId}:`, error);
      }
    });

    ws.on('close', () => {
      console.log(`🔌 Voice WebSocket disconnected for session ${sessionId}`);
      clearInterval(audioInterval);
      activeConnections.delete(sessionId);
      voicePipelineService.endSession(sessionId);
    });

    ws.on('error', (error: any) => {
      console.error(`❌ Voice WebSocket error for ${sessionId}:`, error);
      clearInterval(audioInterval);
      activeConnections.delete(sessionId);
      voicePipelineService.endSession(sessionId);
    });
  }

  function sendTwilioMessage(ws: any, message: any) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(message));
    }
  }

  function createInitialGreeting(): string {
    // Create a simple audio greeting (base64 encoded silence for now)
    // TODO: Replace with actual TTS greeting
    const silenceBuffer = Buffer.alloc(1600, 0); // 200ms of silence at 8kHz
    return silenceBuffer.toString('base64');
  }

  // TwiML endpoint for voice pipeline calls
  router.post('/voice-pipeline/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    console.log(`[VOICE-PIPELINE] TwiML request for session ${sessionId}`);

    try {
      // Extract call ID from session ID (assuming format like "call_123_timestamp")
      const callId = parseInt(sessionId.split('_')[1]) || 0;
      const call = await storage.getCall(callId);
      if (!call) {
        console.error(`❌ Call not found for session ${sessionId}`);
        return res.status(404).json({ error: 'Call not found' });
      }

      const patient = await storage.getPatient(call.patientId);
      if (!patient) {
        console.error(`❌ Patient not found for call ${call.id}`);
        return res.status(404).json({ error: 'Patient not found' });
      }

      console.log(`[VOICE-PIPELINE] Connecting to voice pipeline session for ${patient.firstName}`);

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${req.get('host')}/ws/voice-pipeline/${sessionId}" />
  </Connect>
</Response>`;

      res.type('text/xml').send(twiml);
    } catch (error) {
      console.error(`❌ Error creating voice TwiML for session ${sessionId}:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Status endpoint for voice pipeline calls
  router.post('/voice-pipeline-status/:callId', async (req, res) => {
    const { callId } = req.params;
    const { CallStatus, CallSid } = req.body;

    console.log(`[VOICE-PIPELINE-STATUS] Call ${callId} status: ${CallStatus}`);

    try {
      await storage.updateCall(parseInt(callId), {
        status: CallStatus === 'completed' ? 'completed' : 
               CallStatus === 'busy' ? 'failed' : 
               CallStatus === 'no-answer' ? 'failed' : 'active',
        completedAt: CallStatus === 'completed' ? new Date() : undefined
      });

      // If call ended, get the conversation transcript
      if (CallStatus === 'completed') {
        const call = await storage.getCall(parseInt(callId));
        if (call) {
          // Generate session ID from call ID for transcript lookup
          const sessionId = `voice_${callId}_${Date.now()}`;
          const transcript = voicePipelineService.getConversationTranscript(sessionId);
          if (transcript) {
            await storage.updateCall(parseInt(callId), {
              transcript,
              aiAnalysis: { type: 'voice_pipeline', exchanges: transcript.split('\n').length / 2 }
            });
          }
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error(`❌ Error updating voice pipeline call status:`, error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use('/api/twilio', router);
  console.log('[VOICE-PIPELINE] Voice pipeline routes registered');
}