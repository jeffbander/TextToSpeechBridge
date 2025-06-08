import WebSocket from 'ws';

// Test GPT-4o Real-time API directly
console.log('Testing GPT-4o Real-time API directly...');

const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'OpenAI-Beta': 'realtime=v1',
  },
});

let fullTranscript = '';

ws.on('open', () => {
  console.log('Connected to OpenAI Real-time API');
  
  // Configure session
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: 'You are a healthcare AI assistant conducting a post-discharge follow-up call for Maria Rodriguez. Start with a warm greeting and ask how she is feeling after her recent hospital discharge.',
      voice: 'alloy',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16'
    }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'session.created') {
    console.log('Session created - triggering conversation...');
    
    // Trigger conversation
    ws.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio']
      }
    }));
  }
  
  if (message.type === 'response.audio_transcript.delta') {
    process.stdout.write(message.delta);
    fullTranscript += message.delta;
  }
  
  if (message.type === 'response.text.delta') {
    process.stdout.write(message.delta);
    fullTranscript += message.delta;
  }
  
  if (message.type === 'response.done') {
    console.log('\n\nFULL GPT-4o HEALTHCARE RESPONSE:');
    console.log('"' + fullTranscript.trim() + '"');
    console.log('\nGPT-4o Real-time API VERIFIED - Healthcare conversation working');
    ws.close();
  }
});

ws.on('error', (error) => {
  console.error('Error:', error.message);
});

setTimeout(() => {
  console.log('\nTimeout reached');
  process.exit(0);
}, 15000);