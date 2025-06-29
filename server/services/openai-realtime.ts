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

  async createRealtimeSession(patientId: number, patientName: string, callId: number, customSystemPrompt?: string): Promise<string> {
    // Check if patient already has an active session - prevent duplicate connections
    const existingSession = Array.from(this.sessions.values()).find(s => 
      s.patientId === patientId && 
      (s.isActive || (s.openaiWs && s.openaiWs.readyState !== WebSocket.CLOSED))
    );
    
    if (existingSession) {
      console.log(`🔄 PREVENTING DUPLICATE SESSION - Found existing session ${existingSession.id} for patient ${patientName}`);
      
      // If session exists but is stale, clean it up and create new one
      if (!existingSession.isActive && (!existingSession.openaiWs || existingSession.openaiWs.readyState === WebSocket.CLOSED)) {
        console.log(`🧹 Cleaning up stale session ${existingSession.id}`);
        await this.endSession(existingSession.id);
      } else {
        // Session is active, reuse it to prevent duplicates
        console.log(`✅ Reusing active session ${existingSession.id} - preventing duplicate Twilio/GPT-4o connection`);
        return existingSession.id;
      }
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

    // CRITICAL: Prevent multiple simultaneous connection attempts per session
    if (session.openaiWs && session.openaiWs.readyState === WebSocket.CONNECTING) {
      console.log(`⏳ DUPLICATE PREVENTION - OpenAI connection already in progress for session ${sessionId}`);
      return session.openaiWs;
    }

    // CRITICAL: Close existing connection if any to prevent audio conflicts
    if (session.openaiWs && session.openaiWs.readyState !== WebSocket.CLOSED) {
      console.log(`🔄 CLOSING EXISTING CONNECTION - Preventing duplicate OpenAI WebSocket for session ${sessionId}`);
      try {
        session.openaiWs.removeAllListeners();
        session.openaiWs.close();
      } catch (error) {
        console.log(`⚠️ Error closing existing WebSocket: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      session.openaiWs = null;
    }

    console.log(`🔗 Attempting OpenAI realtime connection for session ${sessionId}`);

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
      
      // Use custom prompt from CSV upload or default healthcare prompt
      let instructions = session.customSystemPrompt;
      
      // Only filter out clearly inappropriate content, preserve legitimate medical prompts
      if (!instructions || instructions.trim().length < 10) {
        instructions = `You are Tziporah, a nurse assistant for Dr. Jeffrey Bander's cardiology office, located at 432 Bedford Ave, Williamsburg. You are following up with ${patient} using their most recent notes and clinical data.

Your role is to:
1. Check in empathetically based on context (recent hospitalization, abnormal labs, medication changes)
2. Ask relevant follow-up questions or guide patient based on results
3. Escalate or flag concerning responses that may require provider attention
4. Keep tone professional, kind, and clear—like a nurse calling a long-time patient

Start the conversation with a warm greeting and identify yourself as calling from Dr. Bander's office.`;
      } else {
        // Use the custom prompt from CSV upload, ensuring it includes proper context
        instructions = `You are Tziporah, a nurse assistant for Dr. Jeffrey Bander's cardiology office. ${instructions}

Remember to be professional, empathetic, and identify yourself as calling from Dr. Bander's office.`;
        console.log(`🎯 Using custom prompt from CSV upload for ${patient}`);
      }

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
            threshold: 0.7,           // PERFORMANCE FIX: Lower threshold for faster detection
            prefix_padding_ms: 200,   // PERFORMANCE FIX: Reduce padding for faster response
            silence_duration_ms: 1200 // PERFORMANCE FIX: Shorter silence for faster AI response
          },
          temperature: 0.4,                 // PERFORMANCE FIX: Lower temperature for faster, more focused responses
          max_response_output_tokens: 150   // PERFORMANCE FIX: Shorter responses for faster audio generation
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
      
      // Attempt reconnection for unexpected closures during active conversations
      if (code !== 1000 && session.isActive && session.conversationLog.length > 0) {
        console.log(`🔄 Attempting to reconnect session ${sessionId} after unexpected closure`);
        setTimeout(() => {
          if (session.isActive && !session.openaiWs) {
            console.log(`🔗 Reconnecting OpenAI session ${sessionId}`);
            this.initializeOpenAIRealtime(sessionId).catch(error => {
              console.error(`❌ Failed to reconnect session ${sessionId}:`, error);
              session.isActive = false;
            });
          }
        }, 1000);
      } else if (code !== 1000 && session.isActive) {
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
        // Reset silent periods when AI is speaking to prevent disconnection
        session.silentPeriods = 0;
        
        // Clear input buffer while AI is speaking to prevent feedback loop
        if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
          session.openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.clear'
          }));
        }
        
        // Stream audio back to Twilio in proper G.711 chunks (320 bytes = 20ms)
        console.log(`🔊 Sending audio delta to Twilio - payload length: ${message.delta?.length || 0}`);
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN && message.delta) {
          // CRITICAL: Proper chunking for Twilio G.711 μ-law compatibility
          const CHUNK_SIZE = 320; // Standard G.711 chunk size for 20ms audio
          const audioPayload = message.delta;
          
          if (!session.outboundChunkCount) session.outboundChunkCount = 0;
          
          for (let i = 0; i < audioPayload.length; i += CHUNK_SIZE) {
            const chunk = audioPayload.slice(i, i + CHUNK_SIZE);
            
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
          console.log(`📤 Sent ${Math.ceil(audioPayload.length / CHUNK_SIZE)} audio chunks to Twilio`);
        } else {
          console.log(`❌ Cannot send audio to Twilio - WebSocket not ready. State: ${session.websocket?.readyState}`);
        }
        break;
        
      case 'response.audio.done':
        // Signal audio completion and resume listening for patient input
        if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.send(JSON.stringify({ type: 'audio_done' }));
          console.log(`✅ Audio response completed for session ${sessionId}`);
        }
        
        // Resume listening for patient input after AI finishes speaking
        setTimeout(() => {
          if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
            console.log(`🎧 Resuming patient audio input for ${sessionId}`);
          }
        }, 500);
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
      // CRITICAL FIX: Only initialize once when call connects
      if (!session.openaiWs || session.openaiWs.readyState === WebSocket.CLOSED) {
        this.initializeOpenAIRealtime(sessionId);
      } else {
        console.log(`🔄 PREVENTING DUPLICATE - OpenAI already connected for session ${sessionId}`);
      }
    } else if (message.event === 'start') {
      console.log(`🎙️ Audio streaming started for session ${sessionId}`);
      
      if (message.streamSid) {
        session.streamSid = message.streamSid;
        session.outboundChunkCount = 0; // Reset chunk counter
        console.log(`📡 Stream SID: ${message.streamSid}`);
      }
      
      // CRITICAL FIX: Do NOT re-initialize if already connected
      if (!session.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) {
        console.log(`🔗 OpenAI not ready, initializing for session ${sessionId}`);
        this.initializeOpenAIRealtime(sessionId);
      } else {
        console.log(`✅ OpenAI already ready for session ${sessionId} - streaming can begin`);
      }
      
      console.log(`🎯 Audio streaming ready - GPT-4o will respond to patient input`);
    } else if (message.event === 'media') {
      // PERFORMANCE FIX: Reduce logging noise for media packets
      if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
        const audioData = message.media.payload;
        
        // Check for silent/muted audio patterns to prevent session timeouts
        const isSilentAudio = this.detectSilentAudio(audioData);
        if (isSilentAudio) {
          // Track silent periods
          session.silentPeriods = (session.silentPeriods || 0) + 1;
          
          // Send keepalive after extended silence (every 30 packets = ~6 seconds)
          if (session.silentPeriods % 30 === 0) {
            console.log(`🔇 Detected extended silence for ${sessionId} - sending keepalive`);
            this.sendKeepalive(sessionId);
          }
        } else {
          // Reset silent period counter on voice activity
          session.silentPeriods = 0;
        }
        
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: audioData
        };
        
        try {
          session.openaiWs.send(JSON.stringify(audioMessage));
          // PERFORMANCE FIX: Log only every 50th packet to reduce noise
          if (Math.random() < 0.02) { // 2% chance = ~1 log per 50 packets
            console.log(`📤 Audio forwarded to OpenAI (payload: ${audioData?.length || 0})`);
          }
        } catch (error) {
          console.error(`❌ Failed to send audio to OpenAI:`, error);
        }
      } else {
        console.log(`❌ OpenAI WebSocket not ready - state: ${session.openaiWs?.readyState || 'null'}`);
        // Buffer audio if OpenAI is not ready yet
        session.audioBuffer.push(Buffer.from(message.media.payload, 'base64'));
        if (session.audioBuffer.length % 10 === 0) { // Log every 10th buffered packet
          console.log(`📦 Buffered audio packets - buffer size: ${session.audioBuffer.length}`);
        }
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

  private detectSilentAudio(audioData: string): boolean {
    // Simple silence detection - check for repeated patterns indicating muted/silent audio
    const decodedLength = audioData.length;
    
    // If audio data is very repetitive or contains mostly padding characters, likely silent
    const paddingChars = audioData.match(/[fn5+/37]/g)?.length || 0;
    const repetitiveRatio = paddingChars / decodedLength;
    
    return repetitiveRatio > 0.8; // >80% repetitive patterns suggests silence/mute
  }

  private sendKeepalive(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.openaiWs || session.openaiWs.readyState !== WebSocket.OPEN) return;

    try {
      // Send a session update to keep connection alive during silence
      const keepaliveMessage = {
        type: 'session.update',
        session: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 1000
          }
        }
      };
      
      session.openaiWs.send(JSON.stringify(keepaliveMessage));
      console.log(`💓 Sent keepalive for session ${sessionId}`);
    } catch (error) {
      console.error(`❌ Error sending keepalive for session ${sessionId}:`, error);
    }
  }

  private async saveSessionData(session: RealtimeSession) {
    const duration = Date.now() - session.startedAt.getTime();
    const durationSeconds = Math.floor(duration / 1000);
    
    console.log(`💾 Saving session data for ${session.id}: {
  patientId: ${session.patientId},
  callId: ${session.callId},
  duration: ${duration},
  transcriptLength: ${session.transcript.length},
  conversationLogLength: ${session.conversationLog.length}
}`);
    
    // Evaluate call success using AI
    const callAssessment = await this.evaluateCallSuccess(session, durationSeconds);
    
    await storage.updateCall(session.callId, {
      status: 'completed',
      duration: durationSeconds,
      transcript: session.transcript.join(' '),
      successRating: callAssessment.successRating,
      qualityScore: callAssessment.qualityScore,
      informationGathered: callAssessment.informationGathered,
      outcome: callAssessment.outcome,
      aiAnalysis: callAssessment.analysis
    });

    await this.saveTranscriptToFile(session);
  }

  private async evaluateCallSuccess(session: RealtimeSession, durationSeconds: number): Promise<{
    successRating: string;
    qualityScore: number;
    informationGathered: boolean;
    outcome: string;
    analysis: any;
  }> {
    try {
      // Extract patient responses from conversation log
      const patientResponses = session.conversationLog
        .filter(entry => entry.speaker === 'patient')
        .map(entry => entry.text)
        .join(' ');

      const conversationText = session.conversationLog
        .map(entry => `${entry.speaker.toUpperCase()}: ${entry.text}`)
        .join('\n');

      const evaluationPrompt = `
Analyze this healthcare follow-up call and determine if it was successful. Consider:

1. DURATION: Call lasted ${durationSeconds} seconds (success threshold: 30+ seconds)
2. INFORMATION QUALITY: Did the patient provide meaningful health information?
3. ENGAGEMENT: Did the patient actively participate in the conversation?

CONVERSATION TRANSCRIPT:
${conversationText}

PATIENT RESPONSES ONLY:
${patientResponses}

Rate this call on:
- SUCCESS RATING: "successful" (patient engaged + info gathered OR 30+ seconds), "partially_successful" (some engagement), "unsuccessful" (no engagement, <30 seconds)
- QUALITY SCORE: 1-10 (conversation quality and information value)
- INFORMATION GATHERED: true/false (did patient share health status, symptoms, medication compliance, etc.)
- OUTCOME: "routine" (normal follow-up), "needs_attention" (concerning symptoms), "escalated" (urgent issues)

Respond in JSON format only:
{
  "successRating": "successful|partially_successful|unsuccessful",
  "qualityScore": 1-10,
  "informationGathered": true/false,
  "outcome": "routine|needs_attention|escalated",
  "reasoningNotes": "brief explanation of assessment",
  "keyFindings": ["list", "of", "important", "health", "information"]
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: evaluationPrompt }],
        temperature: 0.1,
        max_tokens: 500
      });

      const analysisText = response.choices[0]?.message?.content || '{}';
      let analysis;
      
      try {
        analysis = JSON.parse(analysisText);
      } catch (parseError) {
        console.error('Failed to parse AI analysis, using fallback assessment');
        analysis = this.getFallbackAssessment(durationSeconds, patientResponses);
      }

      // Apply business logic for success determination
      let successRating = analysis.successRating || 'unsuccessful';
      
      // Override AI assessment if duration + basic criteria are met
      if (durationSeconds >= 30 && patientResponses.trim().length > 20) {
        if (successRating === 'unsuccessful') {
          successRating = 'partially_successful';
        }
      }

      console.log(`📊 Call assessment for ${session.id}: Rating=${successRating}, Quality=${analysis.qualityScore}, Duration=${durationSeconds}s, InfoGathered=${analysis.informationGathered}`);

      return {
        successRating,
        qualityScore: analysis.qualityScore || this.getQualityScoreFromDuration(durationSeconds),
        informationGathered: analysis.informationGathered || false,
        outcome: analysis.outcome || 'routine',
        analysis: {
          reasoningNotes: analysis.reasoningNotes,
          keyFindings: analysis.keyFindings || [],
          durationSeconds,
          patientResponseLength: patientResponses.length,
          conversationExchanges: session.conversationLog.length
        }
      };

    } catch (error) {
      console.error('Error evaluating call success:', error);
      return this.getFallbackAssessment(durationSeconds, session.conversationLog
        .filter(entry => entry.speaker === 'patient')
        .map(entry => entry.text)
        .join(' '));
    }
  }

  private getFallbackAssessment(durationSeconds: number, patientResponses: string): {
    successRating: string;
    qualityScore: number;
    informationGathered: boolean;
    outcome: string;
    analysis: any;
  } {
    const hasSubstantialResponse = patientResponses.trim().length > 50;
    const meetsDurationThreshold = durationSeconds >= 30;
    
    let successRating = 'unsuccessful';
    if (meetsDurationThreshold && hasSubstantialResponse) {
      successRating = 'successful';
    } else if (meetsDurationThreshold || hasSubstantialResponse) {
      successRating = 'partially_successful';
    }

    return {
      successRating,
      qualityScore: this.getQualityScoreFromDuration(durationSeconds),
      informationGathered: hasSubstantialResponse,
      outcome: 'routine',
      analysis: {
        reasoningNotes: 'Fallback assessment due to AI evaluation error',
        keyFindings: [],
        durationSeconds,
        patientResponseLength: patientResponses.length
      }
    };
  }

  private getQualityScoreFromDuration(durationSeconds: number): number {
    if (durationSeconds >= 120) return 8; // 2+ minutes = high quality
    if (durationSeconds >= 60) return 6;  // 1+ minute = good quality
    if (durationSeconds >= 30) return 4;  // 30+ seconds = acceptable
    return 2; // Less than 30 seconds = poor quality
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