import WebSocket from 'ws';
import OpenAI from 'openai';
import { storage } from '../storage';
import fs from 'fs';
import path from 'path';

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
  customSystemPrompt?: string;
  streamSid?: string;
  outboundChunkCount?: number;
  conversationLog: Array<{
    timestamp: Date;
    speaker: 'ai' | 'patient';
    text: string;
  }>;
}

export class OpenAIRealtimeService {
  private sessions: Map<string, RealtimeSession> = new Map();
  private activePatients: Set<number> = new Set();

  async createRealtimeSession(patientId: number, patientName: string, callId: number, customSystemPrompt?: string): Promise<string> {
    // Check if patient already has an active session
    if (this.activePatients.has(patientId)) {
      throw new Error(`Patient ${patientName} already has an active session`);
    }

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
      customSystemPrompt,
      conversationLog: []
    };

    this.sessions.set(sessionId, session);
    this.activePatients.add(patientId);
    
    console.log(`✨ Created realtime session ${sessionId} for patient ${patientName}`);
    return sessionId;
  }

  async initializeOpenAIRealtime(sessionId: string): Promise<WebSocket> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    session.openaiWs = openaiWs;

    openaiWs.on('open', () => {
      console.log(`🔗 OpenAI WebSocket connected for session ${sessionId}`);
      
      const patient = session.patientName;
      
      let instructions = session.customSystemPrompt || 
        `You are a healthcare assistant conducting a follow-up call with ${patient}. Be empathetic, professional, and ask relevant health questions about their recovery.`;

      // Extract voice and language preferences from custom prompt metadata if available
      let selectedVoice = 'alloy'; // default voice
      let languageInstruction = '';
      
      // If there's a custom system prompt, check if it contains metadata for language preference
      if (session.customSystemPrompt) {
        // Add language instruction based on metadata (this will be passed from the prompt metadata)
        // For now, we'll enhance the instructions to include language guidance
        const languageMatch = session.customSystemPrompt.match(/Language:\s*(\w+)/i);
        if (languageMatch) {
          const language = languageMatch[1];
          if (language !== 'English') {
            languageInstruction = `\n\nIMPORTANT: Conduct this entire conversation in ${language}. Speak naturally and fluently in ${language} throughout the call.`;
            instructions += languageInstruction;
          }
        }
      }
      
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions,
          voice: selectedVoice,
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.8,
            prefix_padding_ms: 500,
            silence_duration_ms: 3000
          }
        }
      };
      
      console.log(`📋 Session config:`, JSON.stringify(sessionConfig, null, 2));
      openaiWs.send(JSON.stringify(sessionConfig));
      console.log(`⚙️ Session configuration sent for ${sessionId}`);
      
      if (session.customSystemPrompt) {
        console.log(`🔴 Using custom system prompt for ${session.patientName}`);
      } else {
        console.log(`🔴 Using default system prompt for ${session.patientName}`);
      }
      
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
        console.log(`🎯 OpenAI session created for ${sessionId}`);
        break;
        
      case 'response.text.delta':
        if (message.delta) {
          console.log(`🤖 AI response for ${sessionId}:`, message.delta);
        }
        break;
        
      case 'response.audio.delta':
        // Stream audio back to Twilio in chunks using proper media stream format
        console.log(`🔊 Sending audio delta to Twilio - payload length: ${message.delta?.length || 0}`);
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN && message.delta) {
          // Split the large audio payload into smaller chunks for better streaming
          const chunkSize = 320; // Standard G.711 chunk size for 20ms audio
          const audioData = message.delta;
          
          for (let i = 0; i < audioData.length; i += chunkSize) {
            const chunk = audioData.slice(i, i + chunkSize);
            
            if (!session.outboundChunkCount) {
              session.outboundChunkCount = 0;
            }
            
            const mediaMessage = {
              event: 'media',
              streamSid: session.streamSid || session.id,
              media: {
                track: 'outbound',
                chunk: session.outboundChunkCount.toString(),
                timestamp: (session.outboundChunkCount * 20).toString(), // 20ms intervals
                payload: chunk
              }
            };
            
            session.outboundChunkCount++;
            session.websocket.send(JSON.stringify(mediaMessage));
          }
          console.log(`📤 Sent ${Math.ceil(audioData.length / chunkSize)} audio chunks to Twilio`);
        } else {
          console.log(`❌ Cannot send audio to Twilio - WebSocket not ready. State: ${session.websocket?.readyState}`);
        }
        break;
        
      case 'response.audio_transcript.delta':
        if (message.delta) {
          session.transcript.push(message.delta);
          
          // Consolidate AI responses instead of logging each word fragment
          const lastEntry = session.conversationLog[session.conversationLog.length - 1];
          if (lastEntry && lastEntry.speaker === 'ai' && 
              (new Date().getTime() - lastEntry.timestamp.getTime()) < 2000) {
            // Append to existing response if within 2 seconds
            lastEntry.text += message.delta;
          } else {
            // Create new response entry
            session.conversationLog.push({
              timestamp: new Date(),
              speaker: 'ai',
              text: message.delta
            });
          }
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (message.transcript) {
          console.log(`👤 Patient said: ${message.transcript}`);
          session.conversationLog.push({
            timestamp: new Date(),
            speaker: 'patient',
            text: message.transcript
          });
        }
        break;
    }
  }

  connectClientWebSocket(sessionId: string, twilioWs: WebSocket) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ Session ${sessionId} not found for WebSocket connection`);
      return;
    }
    
    session.websocket = twilioWs;
    console.log(`🔗 Client WebSocket connected to session ${sessionId}`);
    
    twilioWs.on('close', () => {
      console.log(`🔗 Client disconnected from session ${sessionId}`);
      this.endSession(sessionId);
    });
  }

  handleClientMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    console.log(`📨 Twilio message for ${sessionId}:`, JSON.stringify(message).substring(0, 200));
    
    if (message.event === 'connected') {
      console.log(`📞 Twilio call connected for session ${sessionId}`);
      this.initializeOpenAIRealtime(sessionId);
    } else if (message.event === 'start') {
      console.log(`🎙️ Audio streaming started for session ${sessionId}`);
      
      if (message.streamSid) {
        session.streamSid = message.streamSid;
        console.log(`📡 Stream SID: ${message.streamSid}`);
      }
      
      console.log(`🎯 Audio streaming ready - GPT-4o will initiate conversation based on system prompt`);
    } else if (message.event === 'media') {
      console.log(`🎵 Received audio payload from Twilio - length: ${message.media?.payload?.length || 0}`);
      if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
        const audioData = message.media.payload;
        console.log(`🔄 Forwarding audio to OpenAI - payload length: ${audioData?.length || 0}`);
        
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: audioData
        };
        
        session.openaiWs.send(JSON.stringify(audioMessage));
      }
    } else if (message.event === 'stop') {
      console.log(`🛑 Audio streaming stopped for session ${sessionId}`);
      this.endSession(sessionId);
    }
  }

  async endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    console.log(`🔴 Ended realtime session ${sessionId} for patient ${session.patientName}`);
    
    if (session.openaiWs) {
      session.openaiWs.close();
    }
    
    await this.saveSessionData(session);
    
    this.activePatients.delete(session.patientId);
    this.sessions.delete(sessionId);
  }

  private async saveSessionData(session: RealtimeSession) {
    const duration = Date.now() - session.startedAt.getTime();
    
    console.log(`💾 Saving session data for ${session.id}: {
  patientId: ${session.patientId},
  callId: ${session.callId},
  duration: ${duration},
  transcriptLength: ${session.transcript.length},
  conversationLogLength: ${session.conversationLog.length}
}`);
    
    await storage.updateCall(session.callId, {
      status: 'completed',
      duration: Math.floor(duration / 1000),
      transcript: session.transcript.join(' '),
      summary: `Real-time conversation completed. ${session.conversationLog.length} exchanges recorded.`
    });

    await this.saveTranscriptToFile(session);
  }

  private async saveTranscriptToFile(session: RealtimeSession) {
    const logsDir = 'conversation_logs';
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = Date.now();
    const filename = `conversation_${session.id}_${timestamp}.txt`;
    const filepath = path.join(logsDir, filename);
    
    const duration = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);
    
    let content = `HEALTHCARE CONVERSATION TRANSCRIPT
=====================================
Session ID: ${session.id}
Patient: ${session.patientName} (ID: ${session.patientId})
Call ID: ${session.callId}
Duration: ${duration} seconds
Date: ${session.startedAt.toISOString()}
Total Exchanges: ${session.conversationLog.length}

─────────────────────────────────────────────────────────

`;

    session.conversationLog.forEach((entry, index) => {
      const time = entry.timestamp.toLocaleTimeString();
      const speaker = entry.speaker === 'ai' ? 'AI' : 'PATIENT';
      content += `[${time}] ${speaker}: ${entry.text}\n\n\n`;
    });

    content += `─────────────────────────────────────────────────────────
End of Conversation
`;

    fs.writeFileSync(filepath, content);
    console.log(`📄 Conversation saved to file: ${filename}`);

    // Also log the conversation for debugging
    console.log(`📞 COMPLETE CONVERSATION LOG - Session ${session.id}
👤 Patient: ${session.patientName}
⏱️  Duration: ${duration}s
📅 Date: ${session.startedAt.toISOString()}
─────────────────────────────────────────────────────────`);
    
    session.conversationLog.forEach((entry) => {
      const time = entry.timestamp.toLocaleTimeString();
      const icon = entry.speaker === 'ai' ? '🤖' : '👤';
      const speaker = entry.speaker === 'ai' ? 'AI' : 'Patient';
      console.log(`[${time}] ${icon} ${speaker}: ${entry.text}`);
    });
    
    console.log(`─────────────────────────────────────────────────────────`);
  }

  getActiveSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllActiveSessions(): RealtimeSession[] {
    return Array.from(this.sessions.values());
  }
}

export const openaiRealtimeService = new OpenAIRealtimeService();