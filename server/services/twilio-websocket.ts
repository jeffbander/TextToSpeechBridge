import { WebSocket } from 'ws';
import { openaiRealtimeService } from './openai-realtime';
import { AudioLogger } from '../utils/logger';

export class TwilioWebSocketHandler {
  
  handleTwilioWebSocket(ws: WebSocket, sessionId: string) {
    console.log(`[TWILIO-WS] New Twilio WebSocket connection for session: ${sessionId}`);
    
    // Get the active GPT-4o session
    const session = openaiRealtimeService.getActiveSession(sessionId);
    if (!session) {
      console.error(`[TWILIO-WS] No active session found for: ${sessionId}`);
      ws.close(1000, 'Session not found');
      return;
    }

    // Initialize OpenAI connection immediately
    this.initializeCallSession(sessionId, null);

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.event) {
          case 'connected':
            console.log(`[TWILIO-WS] Twilio connected for session: ${sessionId}`);
            break;
            
          case 'start':
            console.log(`[TWILIO-WS] Call started for session: ${sessionId}`);
            // Send initial greeting via OpenAI
            this.sendInitialGreeting(sessionId);
            break;
            
          case 'media':
            // Forward Twilio audio to GPT-4o
            this.forwardAudioToGPT4o(sessionId, message.media);
            break;
            
          case 'stop':
            console.log(`[TWILIO-WS] Call stopped for session: ${sessionId}`);
            this.endCallSession(sessionId);
            break;
            
          default:
            console.log(`[TWILIO-WS] Unknown event: ${message.event}`);
        }
        
      } catch (error) {
        console.error(`[TWILIO-WS] Error processing message:`, error);
      }
    });

    ws.on('close', () => {
      console.log(`[TWILIO-WS] WebSocket closed for session: ${sessionId}`);
      this.endCallSession(sessionId);
    });

    ws.on('error', (error) => {
      console.error(`[TWILIO-WS] WebSocket error for session ${sessionId}:`, error);
    });
  }

  private initializeCallSession(sessionId: string, startMessage: any) {
    try {
      // Initialize OpenAI real-time session if not already connected
      const session = openaiRealtimeService.getActiveSession(sessionId);
      if (session && !session.openaiWs) {
        openaiRealtimeService.initializeOpenAIRealtime(sessionId);
      }
      
      console.log(`[TWILIO-WS] Call session initialized for: ${sessionId}`);
      
    } catch (error) {
      console.error(`[TWILIO-WS] Error initializing call session:`, error);
    }
  }

  private sendInitialGreeting(sessionId: string) {
    try {
      const session = openaiRealtimeService.getActiveSession(sessionId);
      if (!session) return;

      // Get patient-specific greeting from the session metadata
      const greeting = `Hello, this is Dr. Wellman calling for a follow-up with ${session.patientName}. I wanted to check in and see how you've been feeling since your last appointment. How has your recovery been going? Are there any concerns or improvements you'd like to discuss?`;
      
      // Send greeting to OpenAI to generate speech
      openaiRealtimeService.handleClientMessage(sessionId, {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: greeting }]
        }
      });

      // Trigger response generation
      openaiRealtimeService.handleClientMessage(sessionId, {
        type: 'response.create'
      });

      console.log(`[TWILIO-WS] Initial greeting sent for session: ${sessionId}`);
      
    } catch (error) {
      console.error(`[TWILIO-WS] Error sending initial greeting:`, error);
    }
  }

  private forwardAudioToGPT4o(sessionId: string, mediaData: any) {
    try {
      // Convert Twilio audio format to OpenAI format
      const audioData = this.convertTwilioAudio(mediaData);
      
      // Send to OpenAI real-time session
      openaiRealtimeService.handleClientMessage(sessionId, {
        type: 'audio_input',
        audio: audioData
      });
      
    } catch (error) {
      console.error(`[TWILIO-WS] Error forwarding audio:`, error);
    }
  }

  private convertTwilioAudio(mediaData: any): number[] {
    try {
      // Twilio sends audio as base64-encoded μ-law
      const payload = mediaData.payload;
      const audioBuffer = Buffer.from(payload, 'base64');
      
      // Convert μ-law to PCM16 (simplified conversion)
      const pcmData: number[] = [];
      for (let i = 0; i < audioBuffer.length; i++) {
        // Basic μ-law to linear conversion
        const sample = this.mulawToLinear(audioBuffer[i]);
        pcmData.push(sample);
      }
      
      return pcmData;
      
    } catch (error) {
      console.error('[TWILIO-WS] Error converting audio:', error);
      return [];
    }
  }

  private mulawToLinear(mulaw: number): number {
    // μ-law to 16-bit linear PCM conversion
    mulaw = ~mulaw;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0F;
    
    let sample = mantissa * 2 + 33;
    sample <<= exponent + 2;
    sample -= 33;
    
    return sign ? -sample : sample;
  }

  private endCallSession(sessionId: string) {
    try {
      // End the OpenAI real-time session
      openaiRealtimeService.endSession(sessionId);
      console.log(`[TWILIO-WS] Call session ended for: ${sessionId}`);
      
    } catch (error) {
      console.error(`[TWILIO-WS] Error ending call session:`, error);
    }
  }
}

export const twilioWebSocketHandler = new TwilioWebSocketHandler();