// Test OpenAI WebSocket connection in application context
const WebSocket = require('ws');

console.log('Testing OpenAI WebSocket connection with current environment...');

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found');
  process.exit(1);
}

const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1'
  }
});

let connected = false;

ws.on('open', () => {
  console.log('✅ OpenAI WebSocket connection established');
  connected = true;
  
  // Send session configuration
  const sessionConfig = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: 'You are a test assistant.',
      voice: 'alloy',
      input_audio_format: 'g711_ulaw',
      output_audio_format: 'g711_ulaw',
      turn_detection: {
        type: 'server_vad',
        threshold: 0.7,
        prefix_padding_ms: 200,
        silence_duration_ms: 1200
      }
    }
  };
  
  ws.send(JSON.stringify(sessionConfig));
  console.log('📋 Session configuration sent');
  
  setTimeout(() => {
    ws.close();
  }, 3000);
});

ws.on('error', (error) => {
  console.error('❌ OpenAI WebSocket error:', error.message);
  console.error('Error details:', error);
});

ws.on('close', (code, reason) => {
  console.log(`🔗 Connection closed - Code: ${code}, Reason: ${reason?.toString() || 'none'}`);
  if (!connected) {
    console.error('❌ Connection never established');
  }
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', message.type);
  } catch (error) {
    console.log('📨 Received non-JSON message');
  }
});

setTimeout(() => {
  if (ws.readyState === WebSocket.CONNECTING) {
    console.error('❌ Connection timeout - still connecting after 10 seconds');
    ws.close();
  }
}, 10000);