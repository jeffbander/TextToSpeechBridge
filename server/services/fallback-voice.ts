import OpenAI from 'openai';
import { storage } from '../storage';
import twilio from 'twilio';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

interface VoiceSession {
  id: string;
  patientId: number;
  patientName: string;
  callId: number;
  twilioCallSid: string;
  conversationState: 'greeting' | 'listening' | 'responding' | 'ended';
  transcript: string[];
  conversationLog: Array<{
    timestamp: Date;
    speaker: 'ai' | 'patient';
    text: string;
  }>;
  customSystemPrompt?: string;
}

export class FallbackVoiceService {
  private sessions: Map<string, VoiceSession> = new Map();

  async createVoiceSession(
    sessionId: string,
    patientId: number, 
    patientName: string, 
    callId: number,
    twilioCallSid: string,
    customSystemPrompt?: string
  ): Promise<void> {
    const session: VoiceSession = {
      id: sessionId,
      patientId,
      patientName,
      callId,
      twilioCallSid,
      conversationState: 'greeting',
      transcript: [],
      conversationLog: [],
      customSystemPrompt
    };

    this.sessions.set(sessionId, session);
    console.log(`[FALLBACK-VOICE] Created voice session ${sessionId} for ${patientName}`);
  }

  async generateInitialGreeting(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const prompt = session.customSystemPrompt || 
      `You are a healthcare assistant calling ${session.patientName} for a follow-up. 
       Start with a brief, professional greeting and ask how they're feeling. Keep it under 30 words.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Start the call' }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      const greeting = completion.choices[0]?.message?.content || 
        `Hello ${session.patientName}, this is your healthcare follow-up call. How are you feeling today?`;

      session.conversationLog.push({
        timestamp: new Date(),
        speaker: 'ai',
        text: greeting
      });

      console.log(`[FALLBACK-VOICE] Generated greeting for ${sessionId}: "${greeting}"`);
      return greeting;

    } catch (error) {
      console.error(`[FALLBACK-VOICE] Error generating greeting:`, error);
      return `Hello ${session.patientName}, this is your healthcare follow-up call. How are you feeling today?`;
    }
  }

  async processPatientResponse(sessionId: string, patientText: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Add patient response to log
    session.conversationLog.push({
      timestamp: new Date(),
      speaker: 'patient',
      text: patientText
    });

    session.transcript.push(`Patient: ${patientText}`);

    try {
      // Build conversation context
      const conversationHistory = session.conversationLog.map(entry => ({
        role: entry.speaker === 'ai' ? 'assistant' as const : 'user' as const,
        content: entry.text
      }));

      const systemPrompt = session.customSystemPrompt || 
        `You are a healthcare assistant conducting a follow-up call with ${session.patientName}. 
         Be professional, empathetic, and ask relevant follow-up questions about their health.
         Keep responses under 40 words. If they seem to be doing well, wrap up the call politely.`;

      const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-6), // Keep last 6 exchanges for context
        { role: 'user', content: patientText }
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        max_tokens: 120,
        temperature: 0.7
      });

      const aiResponse = completion.choices[0]?.message?.content || 
        "Thank you for that information. Is there anything else you'd like to discuss about your health?";

      // Add AI response to log
      session.conversationLog.push({
        timestamp: new Date(),
        speaker: 'ai',
        text: aiResponse
      });

      session.transcript.push(`AI: ${aiResponse}`);

      console.log(`[FALLBACK-VOICE] Generated response for ${sessionId}: "${aiResponse}"`);
      return aiResponse;

    } catch (error) {
      console.error(`[FALLBACK-VOICE] Error processing response:`, error);
      return "Thank you for sharing that. Is there anything else about your health you'd like to discuss?";
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Save conversation to database
      const conversationSummary = session.conversationLog
        .map(entry => `${entry.speaker.toUpperCase()}: ${entry.text}`)
        .join('\n');

      await storage.updateCall(session.callId, {
        status: 'completed',
        transcript: conversationSummary,
        outcome: 'completed_successfully'
      });

      console.log(`[FALLBACK-VOICE] Session ${sessionId} ended and saved to database`);

    } catch (error) {
      console.error(`[FALLBACK-VOICE] Error saving session data:`, error);
    }

    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllActiveSessions(): VoiceSession[] {
    return Array.from(this.sessions.values());
  }
}

export const fallbackVoiceService = new FallbackVoiceService();