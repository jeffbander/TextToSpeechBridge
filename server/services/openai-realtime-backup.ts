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
}

export const openaiRealtimeService = new OpenAIRealtimeService();