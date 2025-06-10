import OpenAI from "openai";
import WebSocket from 'ws';
import { AudioLogger } from '../utils/logger';

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
    const startTime = Date.now();
    
    // Clean up any existing sessions for this patient FIRST
    const existingSessions = Array.from(this.sessions.entries());
    for (const [id, session] of existingSessions) {
      if (session.patientId === patientId) {
        AudioLogger.sessionEnded(id, Date.now() - session.startedAt.getTime(), { patientId });
        await this.endSession(id);
      }
    }
    
    // Clear patient from active set
    this.activePatients.delete(patientId);
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
      conversationLog: [],
      currentResponse: '',
      customSystemPrompt
    };
    
    this.sessions.set(sessionId, session);
    AudioLogger.sessionCreated(sessionId, patientName, { patientId, callId });
    AudioLogger.performance('createRealtimeSession', Date.now() - startTime, { sessionId, patientId });
    
    return sessionId;
  }
  
  async initializeOpenAIRealtime(sessionId: string): Promise<WebSocket> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Connect to OpenAI Realtime API - using latest 2025 model
    const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });
    
    session.openaiWs = openaiWs;
    
    openaiWs.on('open', () => {
      AudioLogger.gpt4oConnection('connected', { sessionId });
      
      // Configure the session with custom or default healthcare-specific instructions
      const instructions = session.customSystemPrompt || `You are a compassionate healthcare AI assistant conducting a post-discharge follow-up call for ${session.patientName}. 
          
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

Patient context: This is a routine post-discharge follow-up call to ensure proper recovery.`;

      console.log(`📝 PROMPT ANALYSIS for ${session.patientName}:`);
      console.log(`Custom prompt available: ${!!session.customSystemPrompt}`);
      if (session.customSystemPrompt) {
        console.log(`Custom prompt preview: ${session.customSystemPrompt.substring(0, 100)}...`);
      } else {
        console.log(`Using fallback prompt for ${session.patientName}`);
      }
      console.log(`Final instructions length: ${instructions.length} characters`);

      // Use default voice for now - can be enhanced later with patient preferences
      const selectedVoice = 'shimmer'; // Changed from alloy to shimmer for a softer, more caring voice
      
      console.log(`🎤 Selected voice: ${selectedVoice}`);
      console.log(`🔧 Configuring OpenAI session...`);

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
      
      // Session ready - wait for patient to speak first
      console.log(`🎬 Session ready - waiting for patient speech to trigger response`);
      
      session.isActive = true;
    });
    
    openaiWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        AudioLogger.gpt4oMessage(message.type, 'in', message, { sessionId });
        this.handleOpenAIMessage(sessionId, message);
      } catch (error) {
        AudioLogger.gpt4oError(error, 'message_parsing', { sessionId });
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
    
    // Debug log all message types for conversation tracking
    if (message.type !== 'response.audio.delta') {
      console.log(`[OPENAI-EVENT] ${sessionId}: ${message.type}`);
    }
    
    switch (message.type) {
      case 'session.created':
        console.log(`✅ OpenAI session created for ${sessionId}`);
        break;
        
      case 'session.updated':
        console.log(`🔄 OpenAI session updated for ${sessionId}`);
        break;
        
      case 'input_audio_buffer.committed':
        console.log(`🎤 Audio buffer committed for ${sessionId}`);
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log(`🗣️ Speech started detected for ${sessionId}`);
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log(`🛑 Speech stopped detected for ${sessionId}`);
        break;
        
      case 'response.created':
        console.log(`📝 Response created for ${sessionId}`);
        break;
        
      case 'response.done':
        console.log(`✅ Response completed for ${sessionId}`);
        break;
        
      case 'conversation.item.created':
        if (message.item.type === 'message' && message.item.role === 'assistant') {
          console.log(`🤖 AI response for ${sessionId}:`, message.item.content);
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
          session.websocket.send(JSON.stringify({
            type: 'audio_done'
          }));
        }
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        const transcript = message.transcript;
        session.transcript.push(`Patient: ${transcript}`);
        session.conversationLog.push({
          timestamp: new Date(),
          speaker: 'patient',
          text: transcript
        });
        console.log(`🎤 Patient said: ${transcript}`);
        
        // Also log to conversation summary
        console.log(`[CONVERSATION] Patient in session ${sessionId}: "${transcript}"`);
        
        // Output ongoing conversation log in real-time
        console.log(`\n📱 LIVE CONVERSATION UPDATE - Session ${sessionId}`);
        console.log(`👤 Patient: ${session.patientName}`);
        console.log(`💬 Latest: "${transcript}"`);
        console.log(`📊 Total exchanges: ${session.conversationLog.length}`);
        console.log(`─────────────────────────────────────────\n`);
        break;
        
      case 'response.text.delta':
        // Handle text responses but don't accumulate if audio transcript is primary
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            type: 'text_delta',
            text: message.delta
          }));
        }
        // Skip text accumulation to prevent duplication with audio transcript
        break;
        
      case 'response.audio_transcript.delta':
        // Handle audio transcript separately to avoid duplication
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({
            type: 'audio_transcript_delta',
            text: message.delta
          }));
        }
        // Use audio transcript as the primary response accumulator
        if (!session.currentResponse) session.currentResponse = '';
        session.currentResponse += message.delta;
        break;
        
      case 'response.done':
        // Complete response - add to transcript and conversation log
        if (session.currentResponse && session.currentResponse.trim()) {
          const aiResponse = session.currentResponse.trim();
          session.transcript.push(`AI: ${aiResponse}`);
          session.conversationLog.push({
            timestamp: new Date(),
            speaker: 'ai',
            text: aiResponse
          });
          console.log(`🤖 AI said: ${aiResponse}`);
          
          // Real-time conversation update for AI responses
          console.log(`\n🤖 AI RESPONSE - Session ${sessionId}`);
          console.log(`👤 Patient: ${session.patientName}`);
          console.log(`💬 AI: "${aiResponse}"`);
          console.log(`📊 Total exchanges: ${session.conversationLog.length}`);
          console.log(`─────────────────────────────────────────\n`);
          
          session.currentResponse = '';
        }
        // Keep session alive - don't close after response
        console.log(`🔄 Session ${sessionId} staying active for patient response`);
        break;
        
      case 'error':
        console.error(`❌ OpenAI error for session ${sessionId}:`, message.error);
        break;
    }
  }
  
  connectClientWebSocket(sessionId: string, twilioWs: WebSocket) {
    console.log(`🔍 Connecting Twilio WebSocket for session ${sessionId}`);
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`❌ Session ${sessionId} not found`);
      twilioWs.close(1000, 'Session not found');
      return;
    }
    
    session.websocket = twilioWs;
    console.log(`🔗 Twilio WebSocket connected to session ${sessionId}`);
    
    // Handle Twilio WebSocket messages (audio streaming format)
    twilioWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Twilio message for ${sessionId}:`, JSON.stringify(message).substring(0, 200));
        
        if (message.event === 'connected') {
          console.log(`📞 Twilio call connected for session ${sessionId}`);
          // Initialize OpenAI connection when Twilio connects
          this.initializeOpenAIRealtime(sessionId);
        } else if (message.event === 'start') {
          console.log(`🎙️ Audio streaming started for session ${sessionId}`);
          
          // Store stream info for proper audio routing
          if (message.streamSid) {
            session.streamSid = message.streamSid;
            console.log(`📡 Stream SID: ${message.streamSid}`);
          }
          
          // Let GPT-4o handle the initial greeting naturally based on the system prompt
          console.log(`🎯 Audio streaming ready - GPT-4o will initiate conversation based on system prompt`);
        } else if (message.event === 'media') {
          // Forward Twilio audio to OpenAI
          console.log(`🎵 Received audio payload from Twilio - length: ${message.media?.payload?.length || 0}`);
          if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
            const audioData = message.media.payload;
            console.log(`🔄 Forwarding audio to OpenAI - payload length: ${audioData?.length || 0}`);
            session.openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: audioData
            }));
          } else {
            console.log(`❌ Cannot forward audio - OpenAI WebSocket not ready. State: ${session.openaiWs?.readyState}`);
          }
        } else if (message.event === 'stop') {
          console.log(`🛑 Audio streaming stopped for session ${sessionId}`);
          this.endSession(sessionId);
        }
      } catch (error) {
        console.error(`❌ Error parsing Twilio message for session ${sessionId}:`, error);
      }
    });
    
    twilioWs.on('close', () => {
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
        // Forward audio directly to OpenAI for real-time conversation
        if (session.openaiWs.readyState === WebSocket.OPEN && message.audio) {
          try {
            // Convert audio to base64 for OpenAI
            const pcmBuffer = Buffer.alloc(message.audio.length * 2);
            for (let i = 0; i < message.audio.length; i++) {
              const sample = Math.max(-32768, Math.min(32767, Math.round(message.audio[i])));
              pcmBuffer.writeInt16LE(sample, i * 2);
            }
            
            const base64Audio = pcmBuffer.toString('base64');
            
            // Send audio to OpenAI for real-time processing
            session.openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64Audio
            }));
            
            console.log(`🎤 Streaming audio to OpenAI: ${message.audio.length} samples for session ${sessionId}`);
          } catch (error) {
            console.error(`❌ Error streaming audio for session ${sessionId}:`, error);
          }
        }
        break;
        
      case 'audio_input_complete':
        // Commit audio buffer and generate AI response for continuous conversation
        if (session.openaiWs.readyState === WebSocket.OPEN) {
          console.log(`🔇 Audio input complete for session ${sessionId} - committing buffer and generating response`);
          
          // Commit the audio buffer to trigger processing
          session.openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.commit'
          }));
          
          // Generate AI response to continue conversation
          session.openaiWs.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['text', 'audio'],
              instructions: 'Continue the healthcare conversation naturally. Respond to what the patient just said and ask appropriate follow-up questions.'
            }
          }));
        }
        session.audioBuffer = [];
        break;
        
      case 'start_conversation':
        // Begin the conversation with initial greeting - SINGLE TRIGGER ONLY
        console.log(`🎯 Received start_conversation for ${session.patientName}`);
        
        // Wait for OpenAI connection to be ready
        const waitForOpenAI = async () => {
          for (let i = 0; i < 10; i++) {
            if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
              console.log(`🚨 SINGLE GPT-4O TRIGGER - SOURCE: start_conversation`);
              console.log(`🚨 SESSION: ${sessionId} for patient ${session.patientName}`);
              
              session.openaiWs.send(JSON.stringify({
                type: 'response.create',
                response: {
                  modalities: ['text', 'audio']
                }
              }));
              
              console.log(`🎵 GPT-4o conversation started for ${sessionId}`);
              return;
            }
            console.log(`⏳ Waiting for OpenAI connection... attempt ${i + 1}`);
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          console.log(`❌ OpenAI connection timeout for ${sessionId}`);
        };
        
        waitForOpenAI();
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
      const duration = Date.now() - session.startedAt.getTime();
      
      console.log(`💾 Saving session data for ${session.id}:`, {
        patientId: session.patientId,
        callId: session.callId,
        duration: duration,
        transcriptLength: session.transcript.length,
        conversationLogLength: session.conversationLog.length
      });
      
      // Always save transcript, even if conversation log is empty (for debugging)
      console.log(`🔍 Session ${session.id} conversation log entries: ${session.conversationLog.length}`);
      console.log(`🔍 Session ${session.id} transcript entries: ${session.transcript.length}`);
      
      // Save transcript regardless of conversation log length for debugging
      await this.saveTranscriptToFile(session);
      
      // Log complete conversation if available
      if (session.conversationLog.length > 0) {
        console.log(`\n📞 COMPLETE CONVERSATION LOG - Session ${session.id}`);
        console.log(`👤 Patient: ${session.patientName}`);
        console.log(`⏱️  Duration: ${Math.round(duration / 1000)}s`);
        console.log(`📅 Date: ${session.startedAt.toISOString()}`);
        console.log(`─────────────────────────────────────────────────────────`);
        
        session.conversationLog.forEach((entry, index) => {
          const timestamp = entry.timestamp.toLocaleTimeString();
          const speaker = entry.speaker === 'ai' ? '🤖 AI' : '👤 Patient';
          console.log(`[${timestamp}] ${speaker}: ${entry.text}`);
        });
        
        console.log(`─────────────────────────────────────────────────────────\n`);
      } else {
        console.log(`📝 Session ${session.id} had no conversation exchanges to log`);
      }
      
    } catch (error) {
      console.error(`❌ Error saving session data:`, error);
    }
  }
  
  private async saveTranscriptToFile(session: RealtimeSession) {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const duration = Date.now() - session.startedAt.getTime();
      const filename = `conversation_${session.id}_${Date.now()}.txt`;
      const filepath = path.join(process.cwd(), 'conversation_logs', filename);
      
      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Build transcript content
      let content = `HEALTHCARE CONVERSATION TRANSCRIPT\n`;
      content += `=====================================\n`;
      content += `Session ID: ${session.id}\n`;
      content += `Patient: ${session.patientName} (ID: ${session.patientId})\n`;
      content += `Call ID: ${session.callId}\n`;
      content += `Duration: ${Math.round(duration / 1000)} seconds\n`;
      content += `Date: ${session.startedAt.toISOString()}\n`;
      content += `Total Exchanges: ${session.conversationLog.length}\n`;
      content += `\n─────────────────────────────────────────────────────────\n\n`;
      
      if (session.conversationLog.length > 0) {
        session.conversationLog.forEach((entry, index) => {
          const timestamp = entry.timestamp.toLocaleTimeString();
          const speaker = entry.speaker === 'ai' ? 'AI' : 'PATIENT';
          content += `[${timestamp}] ${speaker}: ${entry.text}\n\n`;
        });
      } else {
        content += `No conversation exchanges recorded.\n`;
        content += `Call may have ended before patient interaction or due to technical issues.\n\n`;
        
        // Include any transcript data if available
        if (session.transcript.length > 0) {
          content += `Raw Transcript Data:\n`;
          session.transcript.forEach((entry, index) => {
            content += `${index + 1}. ${entry}\n`;
          });
          content += `\n`;
        }
      }
      
      content += `─────────────────────────────────────────────────────────\n`;
      content += `End of Conversation\n`;
      
      // Write to file
      fs.writeFileSync(filepath, content, 'utf8');
      console.log(`📄 Conversation saved to file: ${filename}`);
      
    } catch (error) {
      console.error(`❌ Error saving transcript to file:`, error);
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