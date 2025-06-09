import { Express } from 'express';
import OpenAI from 'openai';
import twilio from 'twilio';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Simple in-memory storage for call sessions
const callSessions = new Map<string, {
  patientName: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  audioBuffer: Buffer[];
}>();

export function registerBasicVoiceRoutes(app: Express) {
  console.log('[BASIC-VOICE] Initializing basic voice routes');

  // Twilio webhook for incoming calls
  app.post('/webhook/voice', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    try {
      const callSid = req.body.CallSid;
      const from = req.body.From;
      
      console.log(`📞 Incoming call from ${from}, SID: ${callSid}`);
      
      // Initialize session
      callSessions.set(callSid, {
        patientName: 'Patient',
        conversationHistory: [],
        audioBuffer: []
      });

      // Start recording and streaming
      twiml.say('Hello, this is CardioCare AI. How are you feeling today?');
      
      // Connect to media stream
      const connect = twiml.connect();
      connect.stream({
        url: `wss://${req.headers.host}/stream/${callSid}`
      });

    } catch (error) {
      console.error('Error in voice webhook:', error);
      twiml.say('I apologize, but I am experiencing technical difficulties. Please call back later.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Simple recording webhook for Twilio
  app.post('/webhook/recording', async (req, res) => {
    try {
      const callSid = req.body.CallSid;
      const recordingUrl = req.body.RecordingUrl;
      
      console.log(`🎤 Recording completed for ${callSid}: ${recordingUrl}`);
      
      // Download and process the recording
      const response = await fetch(recordingUrl + '.wav');
      const audioBuffer = await response.arrayBuffer();
      
      // Process the audio
      await processRecording(callSid, Buffer.from(audioBuffer));
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error processing recording:', error);
      res.status(500).send('Error');
    }
  });

  async function processRecording(callSid: string, audioBuffer: Buffer) {
    const session = callSessions.get(callSid);
    if (!session) return;

    try {
      // Convert to file for OpenAI
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });

      console.log(`🎤 Processing recording for ${callSid}`);

      // Transcribe with Whisper
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1'
      });

      if (transcription.text && transcription.text.trim()) {
        console.log(`📝 Patient: "${transcription.text}"`);
        
        // Add to conversation
        session.conversationHistory.push({
          role: 'user',
          content: transcription.text
        });

        // Generate response
        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are a healthcare assistant conducting a follow-up call with ${session.patientName}. Be empathetic, professional, and ask relevant health questions. Keep responses brief and conversational.`
            },
            ...session.conversationHistory
          ],
          max_tokens: 100,
          temperature: 0.7
        });

        const responseText = completion.choices[0]?.message?.content;
        if (responseText) {
          console.log(`🤖 AI: "${responseText}"`);
          
          session.conversationHistory.push({
            role: 'assistant',
            content: responseText
          });

          // Make a call back to the patient with the response
          await twilioClient.calls.create({
            twiml: `<Response><Say voice="alice">${responseText}</Say></Response>`,
            to: session.patientName, // This would need to be the patient's phone number
            from: process.env.TWILIO_PHONE_NUMBER
          });

          console.log(`🔊 Called back patient with AI response`);
        }
      }
    } catch (error) {
      console.error(`Error processing recording for ${callSid}:`, error);
    }
  }

  // Test endpoint
  app.post('/api/basic-voice/test', async (req, res) => {
    try {
      const { patientName, text } = req.body;
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a healthcare assistant conducting a follow-up call with ${patientName}. Be empathetic, professional, and ask relevant health questions.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      const responseText = completion.choices[0]?.message?.content;
      
      res.json({
        success: true,
        response: responseText,
        patientName
      });
    } catch (error) {
      console.error('Error in basic voice test:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  console.log('[BASIC-VOICE] Basic voice routes registered');
}