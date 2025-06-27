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
  silentPeriods?: number;
  conversationLog: Array<{
    timestamp: Date;
    speaker: 'ai' | 'patient';
    text: string;
  }>;
}

export class OpenAIRealtimeService {
  private sessions: Map<string, RealtimeSession> = new Map();
  private activePatients: Set<number> = new Set();
  private patientLocks: Map<number, boolean> = new Map();

  async createRealtimeSession(patientId: number, patientName: string, callId: number, customSystemPrompt?: string): Promise<string> {
    // CRITICAL: Check for concurrent session creation lock
    if (this.patientLocks.get(patientId)) {
      console.log(`🔒 BLOCKING CONCURRENT SESSION - Patient ${patientId} already has session creation in progress`);
      throw new Error(`Session creation already in progress for patient ${patientId}`);
    }
    
    // Lock this patient to prevent concurrent sessions
    this.patientLocks.set(patientId, true);
    
    try {
      // CRITICAL: Force cleanup ANY existing sessions for this patient to prevent multiple agents
      const allPatientSessions = Array.from(this.sessions.values()).filter(s => s.patientId === patientId);
      
      if (allPatientSessions.length > 0) {
        console.log(`🚨 FORCE CLEANUP - Found ${allPatientSessions.length} existing sessions for patient ${patientId}. Terminating all to prevent multiple agents:`);
        
        for (const session of allPatientSessions) {
          console.log(`🧹 Force terminating session ${session.id}`);
          await this.endSession(session.id);
        }
        
        // Remove from active patients set
        this.activePatients.delete(patientId);
        
        // Wait for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log(`✅ All sessions cleaned for patient ${patientId}, creating fresh session`);
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
      
      // Initialize OpenAI connection immediately when session is created
      await this.initializeOpenAIRealtime(sessionId);
      
      console.log(`✨ Created realtime session ${sessionId} for patient ${patientName}`);
      return sessionId;
      
    } finally {
      // Always release the lock
      this.patientLocks.delete(patientId);
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`🔚 Ending session ${sessionId}`);

    try {
      if (session.openaiWs && session.openaiWs.readyState !== WebSocket.CLOSED) {
        session.openaiWs.removeAllListeners();
        session.openaiWs.close();
      }
      
      if (session.websocket && session.websocket.readyState !== WebSocket.CLOSED) {
        session.websocket.removeAllListeners();
        session.websocket.close();
      }
    } catch (error) {
      console.error(`Error closing WebSocket connections for session ${sessionId}:`, error);
    }

    session.isActive = false;
    this.sessions.delete(sessionId);
    this.activePatients.delete(session.patientId);
    
    console.log(`✅ Session ${sessionId} cleaned up successfully`);
  }

  getActiveSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessionByPatient(patientId: number): RealtimeSession | undefined {
    return Array.from(this.sessions.values()).find(session => 
      session.patientId === patientId && 
      (session.isActive || (session.openaiWs && session.openaiWs.readyState !== WebSocket.CLOSED))
    );
  }

  getAllActiveSessionsForPatient(patientId: number): RealtimeSession[] {
    return Array.from(this.sessions.values()).filter(session => 
      session.patientId === patientId && 
      (session.isActive || (session.openaiWs && session.openaiWs.readyState !== WebSocket.CLOSED))
    );
  }

  async forceCleanupPatientSessions(patientId: number): Promise<number> {
    const patientSessions = Array.from(this.sessions.values()).filter(session => 
      session.patientId === patientId
    );
    
    let cleanedCount = 0;
    for (const session of patientSessions) {
      console.log(`🧹 Force cleaning session ${session.id} for patient ${patientId}`);
      await this.endSession(session.id);
      cleanedCount++;
    }
    
    this.activePatients.delete(patientId);
    return cleanedCount;
  }

  getAllActiveSessions(): RealtimeSession[] {
    return Array.from(this.sessions.values());
  }

  connectClientWebSocket(sessionId: string, websocket: WebSocket): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[REALTIME] No session found for ID: ${sessionId}`);
      websocket.close(1000, 'Session not found');
      return;
    }

    console.log(`[REALTIME] Connecting client WebSocket for session: ${sessionId}`);
    session.websocket = websocket;
    session.isActive = true;

    // OpenAI connection should already be established when session was created
    if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
      console.log(`[REALTIME] OpenAI WebSocket not ready for session ${sessionId}, reinitializing...`);
      this.initializeOpenAIRealtime(sessionId);
    } else {
      console.log(`[REALTIME] OpenAI WebSocket already connected for session ${sessionId}`);
    }

    // Handle WebSocket close
    websocket.on('close', () => {
      console.log(`[REALTIME] Client WebSocket closed for session: ${sessionId}`);
      session.isActive = false;
    });

    websocket.on('error', (error) => {
      console.error(`[REALTIME] Client WebSocket error for session ${sessionId}:`, error);
    });
  }

  handleClientMessage(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[REALTIME] No session found for message handling: ${sessionId}`);
      return;
    }

    // Forward message to OpenAI if connected
    if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
      session.openaiWs.send(JSON.stringify(message));
    } else {
      console.warn(`[REALTIME] OpenAI WebSocket not connected for session: ${sessionId}`);
    }
  }

  private async initializeOpenAIRealtime(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[REALTIME] Cannot initialize OpenAI - session not found: ${sessionId}`);
      return;
    }

    try {
      console.log(`[REALTIME] Initializing OpenAI connection for session: ${sessionId}`);
      
      const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      session.openaiWs = openaiWs;

      openaiWs.on('open', () => {
        console.log(`[REALTIME] OpenAI WebSocket connected for session: ${sessionId}`);
        
        // Send initial configuration
        const config = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: session.customSystemPrompt || `You are a healthcare assistant conducting a follow-up call with ${session.patientName}. Be professional, empathetic, and ask about their recovery, medications, and any concerns.`,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            }
          }
        };
        
        openaiWs.send(JSON.stringify(config));
      });

      openaiWs.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Handle different message types
          if (message.type === 'response.audio.delta' && session.websocket) {
            // Forward audio to client
            session.websocket.send(JSON.stringify({
              type: 'audio_delta',
              audio: message.delta
            }));
          } else if (message.type === 'conversation.item.input_audio_transcription.completed') {
            // Log patient speech
            const transcript = message.transcript;
            session.conversationLog.push({
              timestamp: new Date(),
              speaker: 'patient',
              text: transcript
            });
            session.transcript.push(`Patient: ${transcript}`);
          } else if (message.type === 'response.text.delta') {
            // Handle AI text responses
            if (!session.currentResponse) {
              session.currentResponse = '';
            }
            session.currentResponse += message.delta;
          } else if (message.type === 'response.text.done') {
            // Complete AI response
            if (session.currentResponse) {
              session.conversationLog.push({
                timestamp: new Date(),
                speaker: 'ai',
                text: session.currentResponse
              });
              session.transcript.push(`AI: ${session.currentResponse}`);
              session.currentResponse = '';
            }
          }

          // Forward message to client if connected
          if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
            session.websocket.send(JSON.stringify(message));
          }

        } catch (error) {
          console.error(`[REALTIME] Error processing OpenAI message for session ${sessionId}:`, error);
        }
      });

      openaiWs.on('error', (error) => {
        console.error(`[REALTIME] OpenAI WebSocket error for session ${sessionId}:`, error);
        console.error(`[REALTIME] Error details:`, {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        session.openaiWs = null;
      });

      openaiWs.on('close', (code, reason) => {
        console.log(`[REALTIME] OpenAI WebSocket closed for session: ${sessionId}, code: ${code}, reason: ${reason}`);
        session.openaiWs = null;
      });

    } catch (error) {
      console.error(`[REALTIME] Failed to initialize OpenAI connection for session ${sessionId}:`, error);
    }
  }
}

export const openaiRealtimeService = new OpenAIRealtimeService();