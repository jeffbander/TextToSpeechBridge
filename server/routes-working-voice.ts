import { Express } from 'express';
import OpenAI from 'openai';
import twilio from 'twilio';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export function registerWorkingVoiceRoutes(app: Express) {
  console.log('[WORKING-VOICE] Registering working voice routes');

  // Main voice webhook that Twilio calls
  app.post('/voice', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    twiml.say({
      voice: 'alice'
    }, 'Hello, this is your healthcare follow-up call. Please tell me how you are feeling after your recent treatment.');

    twiml.record({
      maxLength: 30,
      action: '/voice-response',
      method: 'POST'
    });

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Process patient response
  app.post('/voice-response', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    try {
      const recordingUrl = req.body.RecordingUrl;
      
      if (recordingUrl) {
        // Download recording
        const response = await fetch(recordingUrl + '.wav');
        const audioBuffer = await response.arrayBuffer();
        
        // Create file for OpenAI
        const audioFile = new File([audioBuffer], 'patient.wav', { type: 'audio/wav' });

        // Transcribe
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1'
        });

        console.log(`Patient said: ${transcription.text}`);

        // Generate AI response
        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a healthcare assistant. Respond empathetically and ask one follow-up question. Keep under 40 words.'
            },
            {
              role: 'user', 
              content: transcription.text
            }
          ],
          max_tokens: 80
        });

        const aiResponse = completion.choices[0]?.message?.content;
        
        if (aiResponse) {
          twiml.say({ voice: 'alice' }, aiResponse);
        }
      }
      
      twiml.say({ voice: 'alice' }, 'Thank you for the update. Take care!');
      
    } catch (error) {
      console.error('Voice processing error:', error);
      twiml.say({ voice: 'alice' }, 'Thank you for your time. Please contact us if you need assistance.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Test endpoint
  app.get('/voice-test', (req, res) => {
    res.json({ 
      status: 'Working voice system active',
      endpoints: ['/voice', '/voice-response']
    });
  });

  console.log('[WORKING-VOICE] Voice routes registered: /voice, /voice-response');
}