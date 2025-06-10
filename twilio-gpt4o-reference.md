# Twilio GPT-4o Real-time Implementation Reference

## Overview
Complete working implementation of GPT-4o real-time audio with Twilio integration for healthcare patient calls. This document captures all critical configurations, file locations, and implementation details for the working system.

## Critical Configuration Settings

### OpenAI Model Configuration
```javascript
// CRITICAL: Use this exact model version (Updated to GPT-4o Mini)
model: 'gpt-4o-mini-realtime-preview-2025-06-03'

// Voice Activity Detection (VAD) Settings
turn_detection: {
  type: 'server_vad',
  threshold: 0.8,           // Higher threshold for cleaner detection
  prefix_padding_ms: 500,   // Increased padding for better capture
  silence_duration_ms: 3000 // Longer silence for complete thoughts
}

// Audio Format
input_audio_format: 'g711_ulaw',
output_audio_format: 'g711_ulaw',

// Response Settings
temperature: 0.6,
max_response_output_tokens: 300
```

### Audio Chunking for Twilio Compatibility
```javascript
// G.711 μ-law format requirements
const CHUNK_SIZE = 320; // Standard G.711 chunk size for 20ms audio
const TIMESTAMP_INCREMENT = 20; // 20ms intervals

// Proper chunking implementation
for (let i = 0; i < audioPayload.length; i += CHUNK_SIZE) {
  const chunk = audioPayload.slice(i, i + CHUNK_SIZE);
  
  const mediaMessage = {
    event: 'media',
    streamSid: session.streamSid || session.id,
    media: {
      track: 'outbound',
      chunk: session.outboundChunkCount.toString(),
      timestamp: (session.outboundChunkCount * 20).toString(),
      payload: chunk
    }
  };
  
  session.outboundChunkCount++;
  session.websocket.send(JSON.stringify(mediaMessage));
}
```

## File Locations and Implementations

### 1. Server-Side Core Files

#### `/server/services/openai-realtime.ts`
- **Purpose**: Main GPT-4o real-time service implementation
- **Key Features**:
  - Session management
  - OpenAI WebSocket connection
  - Audio stream processing
  - Medical prompt filtering
  - G.711 audio chunking

#### `/server/routes-realtime.ts`
- **Purpose**: WebSocket route handling for real-time connections
- **Endpoints**: 
  - `POST /api/realtime/session` - Create new session
  - WebSocket `/ws/realtime` - Real-time audio streaming

#### `/server/routes-twilio-integration.ts`
- **Purpose**: Twilio webhook integration
- **Key Features**:
  - Automated call initiation
  - Custom prompt handling
  - Call status management

### 2. Client-Side Implementation

#### `/client/src/components/realtime/audio-realtime.tsx`
- **Purpose**: Complete audio buffer accumulation system
- **Critical Features**:
  - Audio buffer accumulation (prevents overlapping voices)
  - Single-voice playback system
  - WebSocket message handling
  - Microphone capture and streaming

#### `/client/src/pages/realtime.tsx`
- **Purpose**: Real-time audio call interface
- **Fixed Issues**: Patient dropdown shows proper names (firstName + lastName)

## Audio Buffer Accumulation System

### Problem Solved
The original system had overlapping AI voices creating poor user experience. The audio buffer accumulation system solves this by:

1. **Accumulating** audio deltas instead of playing immediately
2. **Waiting** for completion signal from OpenAI
3. **Playing** complete response as single audio stream

### Implementation Details
```javascript
// Audio buffer accumulation
const audioBufferRef = useRef<number[]>([]);
const isPlayingRef = useRef<boolean>(false);

// Accumulate audio samples
const accumulateAudioBuffer = useCallback((audioData: ArrayBuffer) => {
  const pcmData = new Int16Array(audioData);
  for (let i = 0; i < pcmData.length; i++) {
    audioBufferRef.current.push(pcmData[i] / 32768.0);
  }
}, []);

// Play accumulated audio when complete
const playAccumulatedAudio = useCallback(async () => {
  if (isPlayingRef.current || audioBufferRef.current.length === 0) return;
  
  isPlayingRef.current = true;
  
  // Create audio buffer from accumulated samples
  const audioBuffer = audioContextRef.current.createBuffer(1, sampleCount, 24000);
  const channelData = audioBuffer.getChannelData(0);
  
  // Copy samples and play
  for (let i = 0; i < sampleCount; i++) {
    channelData[i] = audioBufferRef.current[i];
  }
  
  const source = audioContextRef.current.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContextRef.current.destination);
  source.start(0);
  
  // Clear buffer after playback
  source.onended = () => {
    isPlayingRef.current = false;
    audioBufferRef.current = [];
  };
}, []);
```

## WebSocket Message Flow

### Client → Server Messages
```javascript
// Audio chunk from microphone
{
  type: 'audio_chunk',
  audio: base64EncodedAudio
}
```

### Server → Client Messages
```javascript
// Audio delta (accumulate, don't play immediately)
{
  type: 'audio_delta',
  audio: base64AudioData
}

// Audio completion signal (trigger playback)
{
  type: 'audio_done'
}

// Transcript updates
{
  type: 'text_delta',
  text: 'AI response text'
}

{
  type: 'transcript_update',
  text: 'Patient speech text'
}
```

## Medical Prompt System

### Prompt Filtering (Critical Security Feature)
```javascript
// Filter out inappropriate or test prompts
if (!instructions || 
    instructions.includes('We know everything') || 
    instructions.includes('breathing will slow') ||
    instructions.includes('keystroke') ||
    instructions.toLowerCase().includes('threat') ||
    instructions.toLowerCase().includes('harm')) {
  
  // Use safe medical prompt instead
  instructions = `You are Tziporah, a nurse assistant for Dr. Jeffrey Bander's cardiology office...`;
}
```

### Default Medical Prompt
```javascript
const medicalPrompt = `You are Tziporah, a nurse assistant for Dr. Jeffrey Bander's cardiology office, located at 432 Bedford Ave, Williamsburg. You are following up with ${patient} using their most recent notes and clinical data.

Your role is to:
1. Check in empathetically based on context (recent hospitalization, abnormal labs, medication changes)
2. Ask relevant follow-up questions or guide patient based on results
3. Escalate or flag concerning responses that may require provider attention
4. Keep tone professional, kind, and clear—like a nurse calling a long-time patient

Start the conversation with a warm greeting and identify yourself as calling from Dr. Bander's office.`;
```

## Environment Variables Required

```bash
# OpenAI API Key for GPT-4o real-time
OPENAI_API_KEY=sk-...

# Twilio credentials
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Database
DATABASE_URL=postgresql://...
```

## Session Management

### Session Object Structure
```javascript
interface RealtimeSession {
  id: string;
  patientId: number;
  patientName: string;
  callId: number;
  websocket: WebSocket | null;
  openaiWs: WebSocket | null;
  isActive: boolean;
  startedAt: Date;
  transcript: string[];
  audioBuffer: Buffer[];
  currentResponse?: string;
  customSystemPrompt?: string;
  streamSid?: string;
  outboundChunkCount?: number;
  conversationStarted?: boolean;
  conversationLog: Array<{
    timestamp: Date;
    speaker: 'ai' | 'patient';
    text: string;
  }>;
}
```

## API Endpoints

### Real-time Session Management
- `POST /api/realtime/session` - Create new GPT-4o session
- `WebSocket /ws/realtime?session=<sessionId>` - Connect to session

### Twilio Integration
- `POST /api/twilio/automated-calls` - Start automated call
- `POST /webhook/twilio-stream` - Twilio media stream webhook
- `POST /api/twilio/status/<callId>` - Call status updates

## Testing and Verification

### Quick Test Commands
```bash
# Test session creation
curl -X POST http://localhost:5000/api/realtime/session \
  -H "Content-Type: application/json" \
  -d '{"patientId": 1, "patientName": "Test Patient", "callId": 123}'

# Check patients API
curl -X GET http://localhost:5000/api/patients

# Verify conversation logs
curl -X GET http://localhost:5000/api/conversation-logs
```

## Known Working Configuration Summary

1. **OpenAI Model**: `gpt-4o-realtime-preview-2024-10-01`
2. **VAD Threshold**: 0.8 (higher for cleaner detection)
3. **Audio Format**: G.711 μ-law for Twilio compatibility
4. **Chunk Size**: 320 bytes (20ms audio)
5. **Audio System**: Buffer accumulation with single playback
6. **Prompt Security**: Filtering system blocks inappropriate content
7. **Session Management**: WebSocket-based with proper cleanup

## Troubleshooting Guide

### Common Issues and Solutions

1. **Overlapping AI Voices**
   - Solution: Ensure audio buffer accumulation is working
   - Check: `isPlayingRef.current` prevents concurrent playback

2. **Audio Static/Distortion**
   - Solution: Verify G.711 chunking at 320 bytes
   - Check: Proper timestamp increments (20ms)

3. **Session Not Starting**
   - Solution: Verify OpenAI API key and model name
   - Check: WebSocket connection establishment

4. **Patient Dropdown Shows Wrong Data**
   - Solution: Use `firstName + lastName` not `name` property
   - Check: Import correct Patient type from schema

This document serves as the complete reference for restoring the working GPT-4o real-time implementation.