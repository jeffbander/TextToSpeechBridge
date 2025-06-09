import OpenAI from 'openai';
import { WebSocket } from 'ws';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface SimpleVoiceSession {
  id: string;
  patientId: number;
  patientName: string;
  callId: number;
  websocket: WebSocket | null;
  isActive: boolean;
  startedAt: Date;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  audioBuffer: Buffer[];
}

export class SimpleVoiceService {
  private sessions: Map<string, SimpleVoiceSession> = new Map();

  async createSession(patientId: number, patientName: string, callId: number): Promise<string> {
    const sessionId = `sv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const session: SimpleVoiceSession = {
      id: sessionId,
      patientId,
      patientName,
      callId,
      websocket: null,
      isActive: true,
      startedAt: new Date(),
      conversationHistory: [],
      audioBuffer: []
    };

    this.sessions.set(sessionId, session);
    console.log(`✨ Created simple voice session ${sessionId} for patient ${patientName}`);
    
    return sessionId;
  }

  connectWebSocket(sessionId: string, ws: WebSocket) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.websocket = ws;
    console.log(`🔗 WebSocket connected to session ${sessionId}`);

    ws.on('close', () => {
      console.log(`🔗 WebSocket disconnected from session ${sessionId}`);
      this.endSession(sessionId);
    });
  }

  async handleTwilioMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (message.event === 'connected') {
      console.log(`📞 Twilio connected for session ${sessionId}`);
    } else if (message.event === 'start') {
      console.log(`🎙️ Audio streaming started for session ${sessionId}`);
    } else if (message.event === 'media') {
      // Accumulate audio data
      const audioData = Buffer.from(message.media.payload, 'base64');
      session.audioBuffer.push(audioData);
      
      // Process audio every 2 seconds (40 chunks at 20ms each)
      if (session.audioBuffer.length >= 40) {
        await this.processAudioBuffer(sessionId);
      }
    } else if (message.event === 'stop') {
      console.log(`🛑 Audio streaming stopped for session ${sessionId}`);
      // Process any remaining audio
      if (session.audioBuffer.length > 0) {
        await this.processAudioBuffer(sessionId);
      }
      this.endSession(sessionId);
    }
  }

  private async processAudioBuffer(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.audioBuffer.length === 0) return;

    try {
      // Combine all audio buffers
      const combinedAudio = Buffer.concat(session.audioBuffer);
      session.audioBuffer = []; // Clear buffer

      // Convert μ-law audio to WAV for OpenAI
      const audioBlob = new Blob([combinedAudio], { type: 'audio/wav' });
      const audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });

      console.log(`🎤 Processing audio chunk for ${sessionId} - ${combinedAudio.length} bytes`);

      // Transcribe audio using OpenAI Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en'
      });

      if (transcription.text && transcription.text.trim().length > 0) {
        console.log(`📝 Patient said: "${transcription.text}"`);
        
        // Add to conversation history
        session.conversationHistory.push({
          role: 'user',
          content: transcription.text,
          timestamp: new Date()
        });

        // Generate AI response
        await this.generateResponse(sessionId, transcription.text);
      }

    } catch (error) {
      console.error(`❌ Error processing audio for ${sessionId}:`, error);
    }
  }

  private async generateResponse(sessionId: string, userMessage: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      // Build conversation context
      const messages = [
        {
          role: 'system' as const,
          content: `You are a healthcare assistant conducting a follow-up call with ${session.patientName}. Be empathetic, professional, and ask relevant health questions about their recovery. Keep responses brief and conversational.`
        },
        ...session.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      // Generate text response
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: messages,
        max_tokens: 150,
        temperature: 0.7
      });

      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) return;

      console.log(`🤖 AI response: "${responseText}"`);

      // Add to conversation history
      session.conversationHistory.push({
        role: 'assistant',
        content: responseText,
        timestamp: new Date()
      });

      // Convert text to speech
      await this.generateSpeech(sessionId, responseText);

    } catch (error) {
      console.error(`❌ Error generating response for ${sessionId}:`, error);
    }
  }

  private async generateSpeech(sessionId: string, text: string) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.websocket) return;

    try {
      // Generate speech using OpenAI TTS
      const speech = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3'
      });

      // Convert to buffer
      const audioBuffer = Buffer.from(await speech.arrayBuffer());
      
      // Send audio back to Twilio in base64 chunks
      const base64Audio = audioBuffer.toString('base64');
      const chunkSize = 1600; // Twilio chunk size
      
      for (let i = 0; i < base64Audio.length; i += chunkSize) {
        const chunk = base64Audio.substring(i, i + chunkSize);
        
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            event: 'media',
            streamSid: session.id,
            media: {
              payload: chunk
            }
          }));
        }
      }

      console.log(`🔊 Sent audio response to Twilio for ${sessionId}`);

    } catch (error) {
      console.error(`❌ Error generating speech for ${sessionId}:`, error);
    }
  }

  endSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isActive = false;
    if (session.websocket) {
      session.websocket.close();
    }

    console.log(`🔴 Ended simple voice session ${sessionId}`);
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): SimpleVoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SimpleVoiceSession[] {
    return Array.from(this.sessions.values());
  }
}

export const simpleVoiceService = new SimpleVoiceService();