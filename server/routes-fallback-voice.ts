import type { Express } from "express";
import { fallbackVoiceService } from "./services/fallback-voice";
import twilio from 'twilio';
import OpenAI from 'openai';

export function registerFallbackVoiceRoutes(app: Express) {
  console.log("[FALLBACK-VOICE] Initializing fallback voice routes");

  // Webhook for Twilio call connection - generates TwiML for voice interaction
  app.post("/api/twilio/webhook/fallback/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      console.log(`[FALLBACK-VOICE] Webhook called for session: ${sessionId}`);

      // Generate initial greeting
      const greeting = await fallbackVoiceService.generateInitialGreeting(sessionId);

      // Create TwiML response for voice interaction
      const twiml = new twilio.twiml.VoiceResponse();
      
      // Say the greeting
      twiml.say({ voice: 'alice' }, greeting);
      
      // Record patient response
      twiml.record({
        action: `/api/twilio/process-response/${sessionId}`,
        method: 'POST',
        maxLength: 30,
        playBeep: false,
        transcribe: false,
        timeout: 5
      });

      res.type('text/xml').send(twiml.toString());

    } catch (error) {
      console.error('[FALLBACK-VOICE] Error in webhook:', error);
      
      const errorTwiml = new twilio.twiml.VoiceResponse();
      errorTwiml.say({ voice: 'alice' }, 'Sorry, there was a connection error. Please try calling back.');
      errorTwiml.hangup();
      
      res.type('text/xml').send(errorTwiml.toString());
    }
  });

  // Process patient speech and generate AI response
  app.post("/api/twilio/process-response/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { RecordingUrl, TranscriptionText } = req.body;
      
      console.log(`[FALLBACK-VOICE] Processing response for session ${sessionId}`);

      let patientText = TranscriptionText;

      // If no transcription, try to get recording and transcribe with OpenAI
      if (!patientText && RecordingUrl) {
        try {
          console.log(`[FALLBACK-VOICE] Attempting transcription of recording: ${RecordingUrl}`);
          
          // Download the audio file with Twilio authentication
          const twilioAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
          const response = await fetch(RecordingUrl + '.wav', {
            headers: {
              'Authorization': `Basic ${twilioAuth}`
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch audio: ${response.status}`);
          }
          
          const audioBuffer = await response.arrayBuffer();
          console.log(`[FALLBACK-VOICE] Downloaded audio buffer: ${audioBuffer.byteLength} bytes`);
          
          // Create FormData for OpenAI transcription
          const formData = new FormData();
          const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
          formData.append('file', audioBlob, 'recording.wav');
          formData.append('model', 'whisper-1');
          
          // Use direct fetch for transcription to avoid File API issues
          const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: formData
          });
          
          if (!transcriptionResponse.ok) {
            throw new Error(`Transcription API failed: ${transcriptionResponse.status}`);
          }
          
          const transcriptionData = await transcriptionResponse.json();
          patientText = transcriptionData.text;
          console.log(`[FALLBACK-VOICE] Transcribed: "${patientText}"`);

        } catch (transcribeError) {
          console.error('[FALLBACK-VOICE] Transcription failed:', transcribeError);
          patientText = "I didn't catch that clearly";
        }
      }

      if (!patientText) {
        patientText = "No response detected";
      }

      // Generate AI response
      const aiResponse = await fallbackVoiceService.processPatientResponse(sessionId, patientText);

      // Create TwiML response
      const twiml = new twilio.twiml.VoiceResponse();
      
      // Check if this seems like a natural end to the conversation
      const shouldEndCall = aiResponse.toLowerCase().includes('thank you for your time') || 
                           aiResponse.toLowerCase().includes('take care') ||
                           aiResponse.toLowerCase().includes('goodbye');

      twiml.say({ voice: 'alice' }, aiResponse);

      if (shouldEndCall) {
        twiml.hangup();
      } else {
        // Continue conversation - record next response
        twiml.record({
          action: `/api/twilio/process-response/${sessionId}`,
          method: 'POST',
          maxLength: 30,
          playBeep: false,
          transcribe: false,
          timeout: 5
        });
      }

      res.type('text/xml').send(twiml.toString());

    } catch (error) {
      console.error('[FALLBACK-VOICE] Error processing response:', error);
      
      const errorTwiml = new twilio.twiml.VoiceResponse();
      errorTwiml.say({ voice: 'alice' }, 'Thank you for your time. Take care.');
      errorTwiml.hangup();
      
      res.type('text/xml').send(errorTwiml.toString());
    }
  });

  // Emergency end session endpoint
  app.post("/api/fallback-voice/session/:sessionId/end", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await fallbackVoiceService.endSession(sessionId);
      res.json({ message: "Session ended successfully" });
    } catch (error) {
      console.error("Error ending fallback voice session:", error);
      res.status(500).json({ message: "Failed to end session" });
    }
  });

  // Get active fallback voice sessions
  app.get("/api/fallback-voice/sessions", (req, res) => {
    const sessions = fallbackVoiceService.getAllActiveSessions();
    res.json({
      totalSessions: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        patientName: s.patientName,
        patientId: s.patientId,
        conversationState: s.conversationState,
        duration: Date.now() - new Date(s.conversationLog[0]?.timestamp || Date.now()).getTime()
      }))
    });
  });

  console.log("[FALLBACK-VOICE] Fallback voice routes registered");
}