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
}

export class OpenAIRealtimeService {
  private sessions: Map<string, RealtimeSession> = new Map();
  
  async createRealtimeSession(patientId: number, patientName: string, callId: number): Promise<string> {
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
      audioBuffer: []
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
        this.handleOpenAIMessage(sessionId, message);
      } catch (error) {
        console.error(`❌ Error parsing OpenAI message for session ${sessionId}:`, error);
      }
    });
    
    openaiWs.on('error', (error) => {
      console.error(`❌ OpenAI WebSocket error for session ${sessionId}:`, error);
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
        // Handle text responses if needed
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            type: 'text_delta',
            text: message.delta
          }));
        }
        break;
        
      case 'error':
        console.error(`❌ OpenAI error for session ${sessionId}:`, message.error);
        break;
    }
  }
  
  connectClientWebSocket(sessionId: string, clientWs: WebSocket) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      clientWs.close(1000, 'Session not found');
      return;
    }
    
    session.websocket = clientWs;
    console.log(`🔗 Client connected to realtime session ${sessionId}`);
    
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
  
  private handleClientMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.openaiWs) return;
    
    switch (message.type) {
      case 'audio_chunk':
        // Forward audio to OpenAI
        if (session.openaiWs.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: message.audio
          }));
        }
        break;
        
      case 'start_conversation':
        // Begin the conversation
        if (session.openaiWs.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: 'response.create'
          }));
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
    
    if (session.openaiWs) {
      session.openaiWs.close();
    }
    
    if (session.websocket) {
      session.websocket.close();
    }
    
    console.log(`🔴 Ended realtime session ${sessionId}`);
    
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