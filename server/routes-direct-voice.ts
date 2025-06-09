import { Express } from 'express';
import OpenAI from 'openai';
import twilio from 'twilio';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export function registerDirectVoiceRoutes(app: Express) {
  console.log('[DIRECT-VOICE] Initializing direct voice routes');

  // Direct voice webhook - handles entire conversation in one call
  app.post('/webhook/direct-voice', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    try {
      console.log('📞 Direct voice call received');

      // Start with AI greeting
      twiml.say({
        voice: 'alice'
      }, 'Hello, this is CardioCare AI calling for your follow-up appointment. How are you feeling today?');

      // Record patient response (up to 30 seconds)
      twiml.record({
        maxLength: 30,
        action: '/webhook/process-response',
        method: 'POST',
        trim: 'trim-silence',
        transcribe: true,
        transcribeCallback: '/webhook/transcription'
      });

      // Fallback if no speech detected
      twiml.say({
        voice: 'alice'
      }, 'I did not hear a response. Please call us back when you are ready to talk. Have a great day!');

    } catch (error) {
      console.error('Error in direct voice webhook:', error);
      twiml.say({
        voice: 'alice'
      }, 'I apologize for the technical difficulty. Please call back later or contact your healthcare provider directly.');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Process patient response and generate AI follow-up
  app.post('/webhook/process-response', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    try {
      const recordingUrl = req.body.RecordingUrl;
      const callSid = req.body.CallSid;
      
      console.log(`🎤 Processing recording: ${recordingUrl}`);

      if (recordingUrl) {
        // Download the recording
        const response = await fetch(recordingUrl + '.wav');
        const audioBuffer = await response.arrayBuffer();
        
        // Convert to file for OpenAI Whisper
        const audioFile = new File([audioBuffer], 'response.wav', { type: 'audio/wav' });

        // Transcribe patient response
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1'
        });

        console.log(`📝 Patient said: "${transcription.text}"`);

        if (transcription.text && transcription.text.trim()) {
          // Generate AI response using GPT-4
          const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'You are a healthcare assistant conducting a follow-up call. Be empathetic, professional, and ask one relevant follow-up question about their health. Keep responses brief (under 50 words) and conversational.'
              },
              {
                role: 'user',
                content: transcription.text
              }
            ],
            max_tokens: 100,
            temperature: 0.7
          });

          const aiResponse = completion.choices[0]?.message?.content;
          
          if (aiResponse) {
            console.log(`🤖 AI response: "${aiResponse}"`);
            
            // Speak the AI response
            twiml.say({
              voice: 'alice'
            }, aiResponse);

            // Record another response if conversation should continue
            const shouldContinue = aiResponse.includes('?') || aiResponse.toLowerCase().includes('how') || aiResponse.toLowerCase().includes('what');
            
            if (shouldContinue) {
              twiml.record({
                maxLength: 30,
                action: '/webhook/final-response',
                method: 'POST',
                trim: 'trim-silence'
              });
            } else {
              twiml.say({
                voice: 'alice'
              }, 'Thank you for the update. Take care and contact us if you have any concerns. Goodbye!');
            }
          }
        } else {
          twiml.say({
            voice: 'alice'
          }, 'I did not hear your response clearly. Thank you for your time. Please contact us if you have any health concerns. Goodbye!');
        }
      } else {
        twiml.say({
          voice: 'alice'
        }, 'Thank you for taking the call. Please contact us if you have any questions. Goodbye!');
      }

    } catch (error) {
      console.error('Error processing response:', error);
      twiml.say({
        voice: 'alice'
      }, 'Thank you for your time. Please contact your healthcare provider if you have any concerns. Goodbye!');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Handle final response in conversation
  app.post('/webhook/final-response', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    
    try {
      const recordingUrl = req.body.RecordingUrl;
      
      if (recordingUrl) {
        console.log(`🎤 Processing final response: ${recordingUrl}`);
        
        // Download and transcribe final response
        const response = await fetch(recordingUrl + '.wav');
        const audioBuffer = await response.arrayBuffer();
        const audioFile = new File([audioBuffer], 'final.wav', { type: 'audio/wav' });

        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1'
        });

        console.log(`📝 Final patient response: "${transcription.text}"`);

        // Generate closing response
        const completion = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are ending a healthcare follow-up call. Provide a brief, caring closing statement thanking the patient and encouraging them to contact if needed. Keep under 30 words.'
            },
            {
              role: 'user',
              content: transcription.text
            }
          ],
          max_tokens: 50,
          temperature: 0.7
        });

        const closingResponse = completion.choices[0]?.message?.content;
        
        if (closingResponse) {
          console.log(`🤖 Closing: "${closingResponse}"`);
          twiml.say({
            voice: 'alice'
          }, closingResponse);
        }
      }
      
      // Always end with standard closing
      twiml.say({
        voice: 'alice'
      }, 'Goodbye and take care!');

    } catch (error) {
      console.error('Error in final response:', error);
      twiml.say({
        voice: 'alice'
      }, 'Thank you for your time. Goodbye!');
    }

    res.type('text/xml');
    res.send(twiml.toString());
  });

  // Test endpoint to verify the system works
  app.post('/api/direct-voice/test', async (req, res) => {
    try {
      const { text } = req.body;
      
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a healthcare assistant. Respond empathetically to the patient.'
          },
          {
            role: 'user',
            content: text || 'I am feeling better today'
          }
        ],
        max_tokens: 100
      });

      res.json({
        success: true,
        response: completion.choices[0]?.message?.content,
        test: true
      });
    } catch (error) {
      console.error('Error in direct voice test:', error);
      res.status(500).json({ error: 'Test failed' });
    }
  });

  console.log('[DIRECT-VOICE] Direct voice routes registered');
}