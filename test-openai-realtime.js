import { WebSocket } from 'ws';

console.log('Testing OpenAI Real-time API connection...');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY not found');
  process.exit(1);
}

console.log('🔑 API Key found');

const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'realtime=v1'
  }
});

ws.on('open', () => {
  console.log('✅ OpenAI WebSocket connected successfully');
  
  // Send session configuration
  const sessionConfig = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: 'You are a helpful assistant.',
      voice: 'alloy',
      input_audio_format: 'g711_ulaw',
      output_audio_format: 'g711_ulaw',
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        silence_duration_ms: 200
      }
    }
  };
  
  console.log('📤 Sending session configuration...');
  ws.send(JSON.stringify(sessionConfig));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', message.type, message.error ? `ERROR: ${message.error.message}` : 'OK');
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('❌ Error code:', error.code);
});

ws.on('close', (code, reason) => {
  console.log(`🔴 Connection closed: ${code} - ${reason}`);
  process.exit(0);
});

// Test timeout
setTimeout(() => {
  console.log('⏰ Test timeout - closing connection');
  ws.close();
}, 10000);