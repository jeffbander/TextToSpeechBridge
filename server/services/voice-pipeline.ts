import OpenAI from 'openai';
import { Buffer } from 'buffer';
import fetch from 'node-fetch';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface VoicePipelineSession {
  sessionId: string;
  patientId: number;
  callId: number;
  conversation: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
  audioBuffer: Buffer[];
  isProcessing: boolean;
  lastActivity: Date;
}

class VoicePipelineService {
  private sessions = new Map<string, VoicePipelineSession>();
  private readonly SILENCE_THRESHOLD = 1500; // 1.5 seconds of silence before processing
  private silenceTimers = new Map<string, NodeJS.Timeout>();

  async createSession(sessionId: string, patientId: number, callId: number): Promise<VoicePipelineSession> {
    const session: VoicePipelineSession = {
      sessionId,
      patientId,
      callId,
      conversation: [],
      audioBuffer: [],
      isProcessing: false,
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    console.log(`🎤 Created voice pipeline session ${sessionId} for patient ${patientId}`);
    return session;
  }

  async processAudioChunk(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ Session ${sessionId} not found`);
      return;
    }

    // Add audio to buffer
    session.audioBuffer.push(audioData);
    session.lastActivity = new Date();

    // Clear existing silence timer
    if (this.silenceTimers.has(sessionId)) {
      clearTimeout(this.silenceTimers.get(sessionId)!);
    }

    // Set new silence timer
    this.silenceTimers.set(sessionId, setTimeout(() => {
      this.processSpeechSegment(sessionId);
    }, this.SILENCE_THRESHOLD));
  }

  private async processSpeechSegment(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.isProcessing || session.audioBuffer.length === 0) {
      return;
    }

    session.isProcessing = true;
    console.log(`🎯 Processing speech segment for session ${sessionId}`);

    try {
      // Combine audio buffers
      const combinedAudio = Buffer.concat(session.audioBuffer);
      session.audioBuffer = []; // Clear buffer

      // Convert Twilio audio (G.711 μ-law) to format suitable for Whisper
      const audioForWhisper = await this.convertTwilioAudioForWhisper(combinedAudio);

      // Transcribe with Whisper
      const transcript = await this.transcribeAudio(audioForWhisper);
      
      if (transcript.trim()) {
        console.log(`👤 Patient said: "${transcript}"`);
        
        // Add to conversation
        session.conversation.push({
          role: 'user',
          content: transcript,
          timestamp: new Date()
        });

        // Get AI response
        const aiResponse = await this.getAIResponse(session, transcript);
        console.log(`🤖 AI response: "${aiResponse}"`);

        // Add AI response to conversation
        session.conversation.push({
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date()
        });

        // Convert to speech and send back
        await this.synthesizeAndSendSpeech(sessionId, aiResponse);
      }
    } catch (error) {
      console.error(`❌ Error processing speech for session ${sessionId}:`, error);
    } finally {
      session.isProcessing = false;
    }
  }

  private async convertTwilioAudioForWhisper(twilioAudio: Buffer): Promise<Buffer> {
    // Twilio sends G.711 μ-law encoded audio at 8kHz
    // For now, we'll pass it directly - Whisper can handle various formats
    // TODO: Add proper audio conversion if needed
    return twilioAudio;
  }

  private async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Skip transcription for very short audio (less than 0.5 seconds)
      if (audioBuffer.length < 4000) { // ~0.5 seconds at 8kHz μ-law
        return '';
      }

      // Create a Blob from the buffer for Whisper API
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      const audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'en',
        response_format: 'text',
        temperature: 0.2 // Lower temperature for more consistent transcription
      });

      return transcription?.trim() || '';
    } catch (error) {
      console.error('❌ Whisper transcription error:', error);
      return '';
    }
  }

  private async getAIResponse(session: VoicePipelineSession, userMessage: string): Promise<string> {
    try {
      // Build conversation context
      const messages = [
        {
          role: 'system' as const,
          content: `You are a caring healthcare assistant conducting a follow-up call with a patient. 
          Keep responses brief (1-2 sentences), natural, and conversational. 
          Ask relevant health questions and show empathy. 
          If the patient reports concerning symptoms, acknowledge them and ask for details.`
        },
        ...session.conversation.slice(-5).map(msg => ({ // Keep last 5 exchanges for context
          role: msg.role,
          content: msg.content
        }))
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        max_tokens: 150,
        temperature: 0.7
      });

      return completion.choices[0]?.message?.content || "I'm sorry, could you repeat that?";
    } catch (error) {
      console.error('❌ GPT-4o error:', error);
      return "I'm having trouble understanding. Could you please repeat that?";
    }
  }

  private async synthesizeAndSendSpeech(sessionId: string, text: string): Promise<void> {
    try {
      // Use OpenAI TTS (simpler integration than ElevenLabs for now)
      const mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'nova', // Female voice suitable for healthcare
        input: text,
        response_format: 'mp3'
      });

      const audioBuffer = Buffer.from(await mp3.arrayBuffer());
      
      // Convert MP3 to G.711 μ-law for Twilio (simplified approach)
      // For now, we'll send the audio directly - Twilio can handle MP3
      
      // Send audio back to Twilio WebSocket
      await this.sendAudioToTwilio(sessionId, audioBuffer);
      
    } catch (error) {
      console.error(`❌ TTS error for session ${sessionId}:`, error);
    }
  }

  private async sendAudioToTwilio(sessionId: string, audioBuffer: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`❌ Session ${sessionId} not found for audio sending`);
      return;
    }

    // Store the audio buffer in the session for the WebSocket handler to pick up
    if (!session.audioBuffer) {
      session.audioBuffer = [];
    }
    session.audioBuffer.push(audioBuffer);
    
    console.log(`🔊 Queued ${audioBuffer.length} bytes of audio for session ${sessionId}`);
    
    // Notify the WebSocket handler that audio is ready
    this.notifyAudioReady(sessionId);
  }

  private notifyAudioReady(sessionId: string): void {
    // This will be called by the WebSocket handler to get queued audio
    // For now, just log that audio is ready
    console.log(`📢 Audio ready for session ${sessionId}`);
  }

  // Method for WebSocket handler to get queued audio
  getQueuedAudio(sessionId: string): Buffer | null {
    const session = this.sessions.get(sessionId);
    if (!session || !session.audioBuffer || session.audioBuffer.length === 0) {
      return null;
    }

    // Return the first queued audio buffer
    return session.audioBuffer.shift() || null;
  }

  getSession(sessionId: string): VoicePipelineSession | undefined {
    return this.sessions.get(sessionId);
  }

  endSession(sessionId: string): void {
    // Clear silence timer
    if (this.silenceTimers.has(sessionId)) {
      clearTimeout(this.silenceTimers.get(sessionId)!);
      this.silenceTimers.delete(sessionId);
    }

    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`🔴 Ending voice pipeline session ${sessionId}`);
      console.log(`📞 Final conversation length: ${session.conversation.length} exchanges`);
      this.sessions.delete(sessionId);
    }
  }

  // Get conversation transcript for logging
  getConversationTranscript(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';

    return session.conversation
      .map(msg => `${msg.role === 'user' ? 'Patient' : 'AI'}: ${msg.content}`)
      .join('\n');
  }
}

export const voicePipelineService = new VoicePipelineService();