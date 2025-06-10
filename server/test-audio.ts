// Test script to verify GPT-4o audio functionality
import OpenAI from 'openai';
import WebSocket from 'ws';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testGPT4oAudio() {
  console.log('🧪 Testing GPT-4o Realtime Audio API...');
  
  try {
    const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    ws.on('open', () => {
      console.log('✅ Connected to GPT-4o Realtime API');
      
      // Configure session
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: 'You are a test assistant. Respond with "Hello, this is a test response" when prompted.',
          voice: 'shimmer',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: {
            type: 'server_vad',
            threshold: 0.3,
            prefix_padding_ms: 300,
            silence_duration_ms: 800
          }
        }
      };
      
      ws.send(JSON.stringify(sessionConfig));
      console.log('📋 Session configuration sent');
      
      // Send test message after delay
      setTimeout(() => {
        const testMessage = {
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{
              type: 'input_text',
              text: 'Please say hello'
            }]
          }
        };
        
        ws.send(JSON.stringify(testMessage));
        console.log('📨 Test message sent');
        
        // Create response
        setTimeout(() => {
          const responseCreate = {
            type: 'response.create',
            response: {
              modalities: ['audio']
            }
          };
          
          ws.send(JSON.stringify(responseCreate));
          console.log('🎤 Response creation triggered');
        }, 100);
      }, 500);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📥 Received: ${message.type}`);
        
        if (message.type === 'response.audio.delta') {
          console.log(`🔊 Audio delta received: ${message.delta?.length || 0} bytes`);
        }
        
        if (message.type === 'error') {
          console.error('❌ OpenAI Error:', message.error);
        }
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    ws.on('close', (code, reason) => {
      console.log(`🔴 WebSocket closed: ${code} - ${reason}`);
    });

    // Close after 10 seconds
    setTimeout(() => {
      ws.close();
      console.log('🧪 Test completed');
    }, 10000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testGPT4oAudio();