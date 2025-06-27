# CardioCare AI - System Architecture Documentation

## Overview

CardioCare AI is a comprehensive healthcare automation system that enables automated patient follow-up calls using GPT-4o real-time voice capabilities integrated with Twilio. The system provides healthcare providers with the ability to conduct personalized, AI-driven patient conversations for post-discharge monitoring, medication compliance checks, and symptom tracking.

## System Architecture

### Core Technology Stack
- **Backend**: Node.js with Express server
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: React with TypeScript and Vite
- **AI Integration**: OpenAI GPT-4o real-time API
- **Voice Communications**: Twilio Voice API
- **Styling**: Tailwind CSS with Shadcn/ui components
- **Email Service**: SendGrid for alert notifications

### Key Architectural Decisions

**Modular Route Structure**: The system uses a modular routing approach with separate files for different functionalities (calling, real-time audio, Twilio integration, CSV import) to maintain code organization and scalability.

**Real-time Audio Processing**: Integration with GPT-4o real-time API enables natural conversational AI that can process audio streams directly without transcription delays, providing more fluid patient interactions.

**WebSocket Management**: Dual WebSocket server configuration - one for standard application updates and another for real-time audio streaming, preventing conflicts with Vite's HMR system.

## Key Components

### 1. Database Schema (`shared/schema.ts`)
- **Patients Table**: Stores patient demographics, medical conditions, risk levels, and custom conversation prompts
- **Calls Table**: Tracks call sessions, outcomes, transcripts, and AI analysis results
- **Scheduled Calls Table**: Manages automated call scheduling and campaign management

### 2. Real-time Voice System (`server/services/openai-realtime.ts`)
- Manages GPT-4o WebSocket connections for live audio processing
- Handles session management with automatic cleanup
- Consolidates conversation logging and transcript generation
- Supports custom patient-specific conversation prompts

### 3. Twilio Integration (`server/services/twilio.ts`)
- Initiates outbound calls to patients
- Provides TwiML response generation for call routing
- Handles audio format conversion (G.711 μ-law for Twilio compatibility)
- Manages call status tracking and webhook processing

### 4. Custom Prompt System (`server/services/patient-prompt-manager.ts`)
- Generates personalized conversation templates based on patient data
- Supports condition-specific questioning strategies
- Handles urgency level escalation triggers
- Integrates with database-stored custom prompts

### 5. CSV Import System (`server/services/simple-csv-import.ts`)
- Processes bulk patient data imports using System ID as unique patient identifier
- Creates call campaigns for automated outreach with business hours restrictions
- Handles data validation and flexible field mapping
- Supports campaign-based patient management with 3-attempt retry logic
- Business hours enforcement: CSV-imported calls only between 9 AM - 8 PM Eastern, weekdays only
- Manual calls can be made anytime without business hours restrictions

### 6. AIGENTS Automation Integration (`server/services/aigents-integration.ts`)
- Full integration with AIGENTS automation platform for patient workflow processing
- Automatic triggering of "post call analysis" chain upon successful call completion
- Submits patient source ID and comprehensive call logs for AI-driven analysis
- Webhook endpoints for receiving automation responses and status updates
- Comprehensive logging system for tracking automation triggers and outcomes

## Data Flow

### Automated Call Process
1. **Call Initiation**: Healthcare provider schedules calls through web interface or CSV import
2. **Twilio Call**: System initiates call via Twilio API with custom TwiML endpoint
3. **GPT-4o Connection**: Real-time WebSocket established between Twilio and OpenAI
4. **Audio Streaming**: Patient audio streamed directly to GPT-4o for processing
5. **AI Response**: GPT-4o generates contextual responses based on patient data and conversation
6. **Transcript Generation**: Complete conversation logged with AI analysis
7. **Alert Processing**: Critical symptoms trigger automated provider notifications
8. **Post-Call Analysis**: Automatic AIGENTS automation trigger submits call data for AI analysis

### Voice Session Architecture
```
Patient Phone ↔ Twilio ↔ WebSocket Server ↔ OpenAI GPT-4o Real-time API
                                      ↓
                              Conversation Logging & Analysis
                                      ↓
                              Database Storage & Alert Generation
```

## External Dependencies

### Required Environment Variables
- `OPENAI_API_KEY`: GPT-4o real-time API access
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: Voice communication
- `DATABASE_URL`: PostgreSQL connection string
- `SENDGRID_API_KEY`: Email alert notifications

### Third-party Integrations
- **OpenAI GPT-4o Real-time**: Live audio processing and conversation AI
- **Twilio Voice API**: Telephone call management and audio streaming
- **Neon Database**: Serverless PostgreSQL hosting
- **SendGrid**: Transactional email delivery for urgent alerts

## Deployment Strategy

### Production Configuration
- **Platform**: Replit with autoscale deployment target
- **Build Process**: Vite frontend build + esbuild server bundle
- **Port Management**: Main server on port 5000 with WebSocket path routing
- **Memory Management**: Connection pooling with aggressive cleanup for serverless constraints

### Development Workflow
- **Hot Reload**: Vite HMR for frontend development
- **Database Migrations**: Drizzle kit for schema management
- **Logging**: Comprehensive conversation and error tracking
- **Testing**: Direct GPT-4o integration testing capabilities

### Critical Production Fixes Applied
- **Server Binding**: Configured for 0.0.0.0 to ensure public accessibility in Replit
- **Route Isolation**: TwiML endpoints registered before Vite setup to prevent HTML responses
- **WebSocket Conflicts**: Manual upgrade handling to preserve both voice functionality and HMR

## Changelog
- June 27, 2025: Completed bidirectional AIGENTS integration - implemented automatic post-call analysis triggering with proper chain run ID management and AIGENTS response webhook endpoint at `/webhook/aigents-response` for processing analysis results
- June 21, 2025: Fixed SMS messaging functionality - resolved 400 error, added complete database support for messages table, implemented Twilio SMS integration with delivery status tracking and error handling
- June 20, 2025: System deployed to production - GPT-4o webhook endpoints operational, CSV custom prompts integrated, automated calling campaigns active with real-time voice processing
- June 20, 2025: Fixed webhook URL formatting for proper HTTPS connections, removed business hours restrictions for testing, implemented detailed campaign view with individual call tracking
- June 15, 2025: Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.
UI preferences: Clean hamburger menu navigation with Auto Calls and Patients buttons prominently displayed in header, secondary navigation in hamburger menu for mobile-first design.