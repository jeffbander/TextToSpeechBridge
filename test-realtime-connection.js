import WebSocket from 'ws';

console.log('Testing OpenAI Realtime API connection...');

const apiKey = process.env.OPENAI_API_KEY;
console.log(`API Key present: ${!!apiKey}`);
console.log(`API Key starts with: ${apiKey ? apiKey.substring(0, 8) + '...' : 'N/A'}`);

if (!apiKey) {
  console.error('No API key found');
  process.exit(1);
}

const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'OpenAI-Beta': 'realtime=v1'
  }
});

ws.on('open', () => {
  console.log('✅ Successfully connected to OpenAI Realtime API');
  ws.close();
});

ws.on('error', (error) => {
  console.error('❌ OpenAI Realtime API connection failed:', error.message);
  if (error.message.includes('401')) {
    console.error('Authentication failed - API key may not have realtime access');
  } else if (error.message.includes('403')) {
    console.error('Access forbidden - account may not have realtime API access');
  }
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason || 'No reason provided'}`);
  process.exit(code === 1000 ? 0 : 1);
});

setTimeout(() => {
  console.error('Connection timeout after 10 seconds');
  ws.close();
  process.exit(1);
}, 10000);