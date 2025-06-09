# GPT-4o Real-time Audio Implementation Guide

## Overview
This document details the complete technical implementation of GPT-4o real-time audio for automated patient calls in the CardioCare AI system.

## Architecture

### 1. Audio Flow Pipeline
```
Patient Phone → Twilio → WebSocket → OpenAI GPT-4o → WebSocket → Twilio → Patient Phone
```

### 2. Key Components

#### A. OpenAI Real-time Service (`server/services/openai-realtime.ts`)
- Manages GPT-4o real-time WebSocket connections
- Handles audio streaming and transcription
- Consolidates conversation logging

#### B. Twilio Integration (`server/routes-twilio-integration.ts`) 
- Initiates calls via Twilio API
- Provides webhook endpoints for call handling
- Routes TwiML responses with WebSocket stream URLs

#### C. WebSocket Router (`server/routes-realtime.ts`)
- Handles WebSocket upgrade requests
- Routes Twilio audio messages to OpenAI service
- Manages session connections

## Critical Technical Details

### 1. Audio Format Configuration
```typescript
session: {
  modalities: ['text', 'audio'],
  voice: 'alloy', // or nova, shimmer, etc.
  input_audio_format: 'g711_ulaw',
  output_audio_format: 'g711_ulaw',
  input_audio_transcription: {
    model: 'whisper-1'
  }
}
```

### 2. Voice Activity Detection (VAD) Settings
```typescript
turn_detection: {
  type: 'server_vad',
  threshold: 0.8,           // Higher = less sensitive to background noise
  prefix_padding_ms: 500,   // Audio context before speech detection
  silence_duration_ms: 3000 // Pause required before AI responds
}
```

### 3. Audio Streaming Implementation

#### Inbound (Twilio → OpenAI)
```typescript
const audioMessage = {
  type: 'input_audio_buffer.append',
  audio: message.media.payload // G.711 μ-law audio data
};
session.openaiWs.send(JSON.stringify(audioMessage));
```

#### Outbound (OpenAI → Twilio)
```typescript
// Split large audio chunks into G.711 compatible sizes
const chunkSize = 320; // 20ms audio chunks
for (let i = 0; i < audioData.length; i += chunkSize) {
  const chunk = audioData.slice(i, i + chunkSize);
  const mediaMessage = {
    event: 'media',
    streamSid: session.streamSid,
    media: {
      track: 'outbound',
      chunk: session.outboundChunkCount.toString(),
      timestamp: (session.outboundChunkCount * 20).toString(),
      payload: chunk
    }
  };
  session.websocket.send(JSON.stringify(mediaMessage));
}
```

### 4. TwiML Configuration
```xml
<Response>
  <Connect>
    <Stream url="wss://your-domain.com/ws/realtime/{sessionId}" />
  </Connect>
</Response>
```

### 5. WebSocket Message Routing
```typescript
// Handle Twilio audio messages
websocket.on('message', (data) => {
  const message = JSON.parse(data.toString());
  openaiRealtimeService.handleClientMessage(sessionId, message);
});
```

## Key Debugging Points

### 1. Audio Flow Verification
- Check for `🎵 Received audio payload from Twilio` logs
- Verify `🔄 Forwarding audio to OpenAI` confirmations  
- Monitor `📤 Sent X audio chunks to Twilio` responses

### 2. Connection Status
- OpenAI WebSocket: `🔗 OpenAI WebSocket connected`
- Twilio Stream: `📡 Stream SID: [ID]`
- Session Active: `✨ Created realtime session`

### 3. Common Issues & Solutions

#### No Audio Output
- **Problem**: Audio data flowing but not audible
- **Solution**: Ensure proper G.711 chunking and stream ID routing

#### Background Noise Triggers
- **Problem**: AI responds to non-speech sounds
- **Solution**: Increase VAD threshold and silence duration

#### Delayed Responses  
- **Problem**: Long pauses before AI speaks
- **Solution**: Optimize prefix padding and response generation

## Configuration Examples

### Medical Office Setup
```typescript
const customPrompt = `You are Tziporah, a nurse assistant for Dr. Jeffrey Bander's cardiology office, located at 432 Bedford Ave, Williamsburg. You are following up with a patient using their most recent notes and clinical data.

Your role is to:
1. Check in empathetically based on the context
2. Ask relevant follow-up questions 
3. Escalate concerning responses
4. Keep tone professional, kind, and clear

Start with a warm greeting and identify yourself as calling from Dr. Bander's office.`;
```

### Voice Selection
- `alloy`: Neutral, professional
- `nova`: Warm, friendly (recommended for healthcare)
- `shimmer`: Calm, soothing
- `echo`: Clear, authoritative

## Performance Metrics

### Successful Implementation Indicators
- Audio latency < 2 seconds
- VAD accuracy > 95% (minimal false triggers)
- Conversation completion rate > 90%
- Clear audio quality throughout call duration

### Monitoring Commands
```bash
# Check real-time logs
tail -f conversation_logs/conversation_*.txt

# Monitor WebSocket connections
grep "WebSocket" server.log

# Audio flow debugging  
grep "🎵\|🔄\|📤" server.log
```

## Environment Requirements

### Required Secrets
- `OPENAI_API_KEY`: GPT-4o real-time API access
- `TWILIO_ACCOUNT_SID`: Twilio account identifier
- `TWILIO_AUTH_TOKEN`: Twilio authentication
- `TWILIO_PHONE_NUMBER`: Outbound calling number

### Dependencies
```json
{
  "openai": "^4.x.x",
  "twilio": "^4.x.x", 
  "ws": "^8.x.x"
}
```

## Testing Checklist

- [ ] OpenAI WebSocket connection established
- [ ] Twilio call initiation successful
- [ ] Audio streaming bidirectional
- [ ] Speech recognition accurate
- [ ] Voice responses clear and audible
- [ ] Background noise filtering effective
- [ ] Conversation logging complete
- [ ] Custom prompts applied correctly

This implementation provides production-ready real-time voice AI for healthcare patient outreach with proper medical context and conversation management.