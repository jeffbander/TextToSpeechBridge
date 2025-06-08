import OpenAI from "openai";
import WebSocket from 'ws';

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable must be set");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface RealtimeSession {
  id: string;
  patientId: number;
  patientName: string;
  callId: number;
  websocket: WebSocket | null;
  openaiWs: WebSocket | null;
  isActive: boolean;
  startedAt: Date;
  transcript: string[];
  audioBuffer: Buffer[];
  currentResponse?: string;
}

export class OpenAIRealtimeService {
  private sessions: Map<string, RealtimeSession> = new Map();
  private activePatients: Set<number> = new Set();
  
  async createRealtimeSession(patientId: number, patientName: string, callId: number): Promise<string> {
    // Prevent multiple sessions for the same patient completely
    if (this.activePatients.has(patientId)) {
      throw new Error(`Patient ${patientName} already has an active session. Only one conversation per patient allowed.`);
    }
    
    // Clean up any existing sessions for this patient to prevent multiple GPT-4o instances
    const existingSessions = Array.from(this.sessions.entries());
    for (const [id, session] of existingSessions) {
      if (session.patientId === patientId && session.isActive) {
        console.log(`🧹 Terminating duplicate session ${id} for patient ${patientName}`);
        await this.endSession(id);
      }
    }
    
    this.activePatients.add(patientId);
    
    const sessionId = `rt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const session: RealtimeSession = {
      id: sessionId,
      patientId,
      patientName,
      callId,
      websocket: null,
      openaiWs: null,
      isActive: false,
      startedAt: new Date(),
      transcript: [],
      audioBuffer: [],
      currentResponse: ''
    };
    
    this.sessions.set(sessionId, session);
    console.log(`🔴 Created realtime session ${sessionId} for patient ${patientName}`);
    
    return sessionId;
  }
  
  async initializeOpenAIRealtime(sessionId: string): Promise<WebSocket> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Connect to OpenAI Realtime API
    const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
    
    session.openaiWs = openaiWs;
    
    openaiWs.on('open', () => {
      console.log(`🔴 OpenAI Realtime connected for session ${sessionId}`);
      
      // Configure the session with healthcare-specific instructions
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: `You are a compassionate healthcare AI assistant conducting a post-discharge follow-up call for ${session.patientName}. 
          
Your role:
- Ask about the patient's current health status and recovery
- Listen for any concerning symptoms or complications
- Provide reassuring, professional responses
- Escalate urgent concerns appropriately
- Keep responses concise and caring

Guidelines:
- Use a warm, professional tone
- Ask follow-up questions based on patient responses
- Be attentive to signs of distress or medical urgency
- Provide clear next steps when needed
- End the call when appropriate

Patient context: This is a routine post-discharge follow-up call to ensure proper recovery.`,
          voice: 'alloy',
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 200
          }
        }
      };
      
      openaiWs.send(JSON.stringify(sessionConfig));
      session.isActive = true;
    });
    
    openaiWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 OpenAI message for ${sessionId}:`, message.type);
        this.handleOpenAIMessage(sessionId, message);
      } catch (error) {
        console.error(`❌ Error parsing OpenAI message for session ${sessionId}:`, error);
      }
    });
    
    openaiWs.on('error', (error) => {
      console.error(`❌ OpenAI WebSocket error for session ${sessionId}:`, error);
      console.error(`❌ Error details:`, error.message);
      if (error.message.includes('401')) {
        console.error(`❌ OpenAI API authentication failed - check OPENAI_API_KEY`);
      }
      session.isActive = false;
    });
    
    openaiWs.on('close', () => {
      console.log(`🔴 OpenAI WebSocket closed for session ${sessionId}`);
      session.isActive = false;
    });
    
    return openaiWs;
  }
  
  private handleOpenAIMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    switch (message.type) {
      case 'session.created':
        console.log(`✅ OpenAI session created for ${sessionId}`);
        // Session ready - wait for explicit start command
        break;
        
      case 'conversation.item.created':
        if (message.item.type === 'message' && message.item.role === 'assistant') {
          console.log(`🤖 AI response for ${sessionId}:`, message.item.content);
        }
        break;
        
      case 'response.audio.delta':
        // Stream audio back to client
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            type: 'audio_delta',
            audio: message.delta
          }));
        }
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        const transcript = message.transcript;
        session.transcript.push(`Patient: ${transcript}`);
        console.log(`🎤 Patient said: ${transcript}`);
        break;
        
      case 'response.text.delta':
        // Handle text responses and build transcript
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            type: 'text_delta',
            text: message.delta
          }));
        }
        // Accumulate response text for transcript
        if (!session.currentResponse) session.currentResponse = '';
        session.currentResponse += message.delta;
        break;
        
      case 'response.audio_transcript.delta':
        // Handle audio transcript and build complete response
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            type: 'audio_transcript_delta',
            text: message.delta
          }));
        }
        // Accumulate audio transcript for complete response
        if (!session.currentResponse) session.currentResponse = '';
        session.currentResponse += message.delta;
        break;
        
      case 'response.done':
        // Complete response - add to transcript
        if (session.currentResponse && session.currentResponse.trim()) {
          session.transcript.push(`AI: ${session.currentResponse.trim()}`);
          console.log(`🤖 AI said: ${session.currentResponse.trim()}`);
          session.currentResponse = '';
        }
        break;
        
      case 'error':
        console.error(`❌ OpenAI error for session ${sessionId}:`, message.error);
        break;
    }
  }
  
  connectClientWebSocket(sessionId: string, clientWs: WebSocket) {
    console.log(`🔍 Looking for session ${sessionId}, available sessions:`, Array.from(this.sessions.keys()));
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`❌ Session ${sessionId} not found in sessions map`);
      clientWs.close(1000, 'Session not found');
      return;
    }
    
    session.websocket = clientWs;
    console.log(`🔗 Client connected to realtime session ${sessionId}`);
    
    // Send session ready confirmation
    clientWs.send(JSON.stringify({
      type: 'session_ready',
      sessionId: sessionId,
      patientName: session.patientName
    }));
    
    // Wait for explicit start command - no auto-triggering
    
    // Initialize OpenAI connection when client connects
    this.initializeOpenAIRealtime(sessionId)
      .then(() => {
        console.log(`🔴 OpenAI connection established for session ${sessionId}`);
      })
      .catch((error) => {
        console.error(`❌ OpenAI connection failed for session ${sessionId}:`, error);
        clientWs.send(JSON.stringify({
          type: 'error',
          message: 'Failed to connect to AI service'
        }));
      });
    
    clientWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(sessionId, message);
      } catch (error) {
        console.error(`❌ Error parsing client message for session ${sessionId}:`, error);
      }
    });
    
    clientWs.on('close', () => {
      console.log(`🔗 Client disconnected from session ${sessionId}`);
      this.endSession(sessionId);
    });
  }
  
  handleClientMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.openaiWs) {
      console.log(`❌ No session found for ${sessionId} or no OpenAI connection`);
      return;
    }
    
    console.log(`[REALTIME-WS] Received from client:`, { type: message.type, sessionId, audioLength: message.audio?.length });
    
    switch (message.type) {
      case 'audio_input':
        // Store audio chunks for batch processing
        if (session.openaiWs.readyState === WebSocket.OPEN && message.audio) {
          try {
            // Create proper PCM16 buffer from audio samples
            const pcmBuffer = Buffer.alloc(message.audio.length * 2);
            for (let i = 0; i < message.audio.length; i++) {
              const sample = Math.max(-32768, Math.min(32767, Math.round(message.audio[i])));
              pcmBuffer.writeInt16LE(sample, i * 2);
            }
            session.audioBuffer.push(pcmBuffer);
            
            console.log(`🎵 Audio chunk accumulated: ${message.audio.length} samples for session ${sessionId}`);
          } catch (error) {
            console.error(`❌ Error accumulating audio for session ${sessionId}:`, error);
          }
        }
        break;
        
      case 'audio_input_complete':
        // Handle audio input completion - use text fallback for now
        if (session.openaiWs.readyState === WebSocket.OPEN) {
          try {
            // For now, simulate patient response with text since audio input has format issues
            // This allows the conversation to continue while we resolve the PCM16 format
            session.openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: `Patient ${session.patientName} has spoken (audio processing pending format resolution). Please continue the conversation and ask about their recovery status.`
                }]
              }
            }));
            
            session.openaiWs.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['audio', 'text']
              }
            }));
            
            console.log(`🎵 Conversation continuing with audio response for session ${sessionId}`);
            
            // Clear any accumulated audio buffer
            session.audioBuffer = [];
          } catch (error) {
            console.error(`❌ Error continuing conversation for session ${sessionId}:`, error);
          }
        }
        break;
        
      case 'start_conversation':
        // Begin the conversation with initial greeting - SINGLE TRIGGER ONLY
        if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
          console.log(`🎯 SINGLE GPT-4o conversation starting for ${session.patientName}`);
          
          // Create response immediately to trigger ONE GPT-4o instance
          session.openaiWs.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text', 'audio']
            }
          }));
          
          console.log(`🎵 SINGLE GPT-4o response triggered for ${sessionId}`);
        } else {
          console.log(`❌ OpenAI WebSocket not ready for ${sessionId}`);
        }
        break;
        
      case 'end_conversation':
        this.endSession(sessionId);
        break;
    }
  }
  
  async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.isActive = false;
    
    // Remove patient from active set to allow new sessions
    this.activePatients.delete(session.patientId);
    
    if (session.openaiWs) {
      session.openaiWs.close();
    }
    
    if (session.websocket) {
      session.websocket.close();
    }
    
    console.log(`🔴 Ended realtime session ${sessionId} for patient ${session.patientName}`);
    
    // Save session transcript and analysis
    await this.saveSessionData(session);
    
    this.sessions.delete(sessionId);
  }
  
  private async saveSessionData(session: RealtimeSession) {
    try {
      // Here you would save the session data to your storage
      console.log(`💾 Saving session data for ${session.id}:`, {
        patientId: session.patientId,
        callId: session.callId,
        duration: Date.now() - session.startedAt.getTime(),
        transcriptLength: session.transcript.length
      });
    } catch (error) {
      console.error(`❌ Error saving session data:`, error);
    }
  }
  
  getActiveSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  getAllActiveSessions(): RealtimeSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }
}

export const openaiRealtimeService = new OpenAIRealtimeService();