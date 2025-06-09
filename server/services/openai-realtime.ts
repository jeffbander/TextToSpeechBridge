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
  conversationStarted?: boolean;
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

    // Prevent multiple simultaneous connection attempts
    if (session.openaiWs && session.openaiWs.readyState === WebSocket.CONNECTING) {
      console.log(`⏳ OpenAI connection already in progress for session ${sessionId}`);
      return session.openaiWs;
    }

    // Close existing connection if any
    if (session.openaiWs && session.openaiWs.readyState !== WebSocket.CLOSED) {
      try {
        session.openaiWs.removeAllListeners();
        session.openaiWs.close();
      } catch (error) {
        console.log(`⚠️ Error closing existing WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      session.openaiWs = null;
    }

    console.log(`🔗 Attempting OpenAI realtime connection for session ${sessionId}`);

    const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
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
      
      // Language preferences are handled in the system prompt without automatic triggering
      console.log(`📋 Session configured for patient ${session.patientName} - ready for user interaction`);
      
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
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 2000
          },
          temperature: 0.6,
          max_response_output_tokens: 300
        }
      };
      
      console.log(`📋 Sending session config for ${sessionId}:`, JSON.stringify(sessionConfig, null, 2));
      openaiWs.send(JSON.stringify(sessionConfig));
      console.log(`⚙️ Session configuration sent for ${sessionId}`);
      
      if (session.customSystemPrompt) {
        console.log(`🔴 Using custom system prompt for ${session.patientName}`);
      } else {
        console.log(`🔴 Using default system prompt for ${session.patientName}`);
      }
      
      // Flush any buffered audio packets
      if (session.audioBuffer.length > 0) {
        console.log(`🔄 Flushing ${session.audioBuffer.length} buffered audio packets`);
        session.audioBuffer.forEach((audioData, index) => {
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: audioData.toString('base64')
          };
          openaiWs.send(JSON.stringify(audioMessage));
          console.log(`📤 Sent buffered audio packet ${index + 1}/${session.audioBuffer.length}`);
        });
        session.audioBuffer = []; // Clear the buffer
      }

      // Wait for patient to speak first - no automatic conversation starter
      console.log(`🎧 Session ready - waiting for patient audio input`);
      
      session.isActive = true;
    });
    
    openaiWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 OpenAI message for ${sessionId}:`, message.type, message.delta ? `(${message.delta.length} chars)` : '');
        
        // Log detailed error information
        if (message.type === 'error') {
          console.error(`❌ OpenAI API Error for ${sessionId}:`, JSON.stringify(message, null, 2));
          return;
        }
        
        this.handleOpenAIMessage(sessionId, message);
      } catch (error) {
        console.error(`❌ Error parsing OpenAI message for session ${sessionId}:`, error);
      }
    });
    
    openaiWs.on('error', (error) => {
      console.error(`❌ OpenAI WebSocket error for session ${sessionId}:`, error.message);
      session.openaiWs = null;
      // Prevent crash by handling the error gracefully
    });
    
    openaiWs.on('close', (code, reason) => {
      console.log(`🔴 OpenAI WebSocket closed for session ${sessionId} - Code: ${code}, Reason: ${reason}`);
      session.openaiWs = null;
      
      // End session on unexpected closure to prevent hanging connections
      if (code !== 1000 && session.isActive) {
        console.log(`🛑 Ending session ${sessionId} due to unexpected WebSocket closure`);
        session.isActive = false;
      }
    });
    
    return openaiWs;
  }

  private handleOpenAIMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`❌ No session found for ${sessionId}`);
      return;
    }
    
    console.log(`📥 OpenAI message for ${sessionId}:`, message.type);
    
    switch (message.type) {
      case 'session.created':
        console.log(`🎯 OpenAI session created for ${sessionId}`);
        break;
        
      case 'session.updated':
        console.log(`⚙️ OpenAI session updated for ${sessionId}`);
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log(`🎙️ Speech started detected for ${sessionId}`);
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log(`🔇 Speech stopped detected for ${sessionId}`);
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        if (message.transcript) {
          console.log(`📝 Patient transcription for ${sessionId}:`, message.transcript);
          session.transcript.push(`Patient: ${message.transcript}`);
          session.conversationLog.push({
            timestamp: new Date(),
            speaker: 'patient',
            text: message.transcript
          });
          
          // Manually trigger AI response since turn detection isn't working
          if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
            const responseMessage = {
              type: 'response.create',
              response: {
                modalities: ['text', 'audio']
              }
            };
            console.log(`🎬 Triggering AI response for ${sessionId} after patient speech`);
            session.openaiWs.send(JSON.stringify(responseMessage));
          }
        }
        break;
        
      case 'response.created':
        console.log(`🎬 Response created for ${sessionId}`);
        break;
        
      case 'response.output_item.added':
        console.log(`📤 Output item added for ${sessionId}`);
        break;
        
      case 'response.content_part.added':
        console.log(`📝 Content part added for ${sessionId}`);
        break;
        
      case 'response.text.delta':
        if (message.delta) {
          console.log(`🤖 AI text delta for ${sessionId}:`, message.delta);
        }
        break;
        
      case 'response.text.done':
        if (message.text) {
          console.log(`✅ AI text complete for ${sessionId}:`, message.text);
          session.transcript.push(`AI: ${message.text}`);
          session.conversationLog.push({
            timestamp: new Date(),
            speaker: 'ai',
            text: message.text
          });
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
        
      case 'response.audio.done':
        // Signal audio completion to trigger accumulated playback
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({ type: 'audio_done' }));
          console.log(`✅ Audio response completed for session ${sessionId}`);
        }
        break;
        
      case 'response.audio_transcript.delta':
        if (message.delta) {
          session.transcript.push(message.delta);
          
          // Log AI response transcripts properly
          const lastEntry = session.conversationLog[session.conversationLog.length - 1];
          if (lastEntry && lastEntry.speaker === 'ai' && 
              (new Date().getTime() - lastEntry.timestamp.getTime()) < 3000) {
            // Append to existing response if within 3 seconds
            lastEntry.text += message.delta;
          } else {
            // Create new AI response entry
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
      
      // Initialize OpenAI connection if not already connected
      if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
        console.log(`🔗 Initializing OpenAI connection for session ${sessionId}`);
        this.initializeOpenAIRealtime(sessionId);
      }
      
      console.log(`🎯 Audio streaming ready - GPT-4o will initiate conversation based on system prompt`);
    } else if (message.event === 'media') {
      console.log(`🎵 Received audio payload from Twilio - length: ${message.media?.payload?.length || 0}`);
      
      if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
        const audioData = message.media.payload;
        console.log(`🔄 Forwarding audio to OpenAI - payload length: ${audioData?.length || 0}, WebSocket state: ${session.openaiWs.readyState}`);
        
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: audioData
        };
        
        try {
          session.openaiWs.send(JSON.stringify(audioMessage));
          console.log(`✅ Audio packet sent to OpenAI successfully`);
        } catch (error) {
          console.error(`❌ Failed to send audio to OpenAI:`, error);
        }
      } else {
        console.log(`❌ OpenAI WebSocket not ready - state: ${session.openaiWs?.readyState || 'null'}`);
        // Buffer audio if OpenAI is not ready yet
        session.audioBuffer.push(Buffer.from(message.media.payload, 'base64'));
        console.log(`📦 Buffered audio packet - buffer size: ${session.audioBuffer.length}`);
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
      transcript: session.transcript.join(' ')
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