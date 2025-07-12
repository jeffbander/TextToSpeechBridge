# CardioCare AI - Complete Rebuild Documentation

## 🎯 Project Overview

CardioCare AI is a comprehensive healthcare automation platform that enables automated patient follow-up calls using AI voice technology. The system combines Hume AI's Emotional Voice Interface (EVI) with Twilio's phone services to create natural, empathetic conversations with patients for post-discharge monitoring, medication compliance, and symptom tracking.

## 🏗️ Architecture Summary

### Technology Stack
- **Backend**: Node.js with Express (Object-Oriented Architecture)
- **Frontend**: React with TypeScript and Vite
- **Database**: PostgreSQL with Drizzle ORM
- **AI Services**: Hume AI EVI (primary) + OpenAI GPT-4o (optional)
- **Voice Communications**: Twilio Voice API
- **Styling**: Tailwind CSS with Shadcn/ui components
- **Email**: SendGrid for notifications

### Core Object-Oriented Design
- **CardioCareApp**: Main application factory
- **HumeAIService**: AI conversation processing
- **TwilioCallProvider**: Phone call management
- **CallOrchestrator**: AI + Call coordination
- **DocumentManager**: Patient data isolation
- **SystemEventHandler**: Event processing & alerts

## 📋 Prerequisites

### Required Accounts & API Keys
1. **Hume AI** - EVI API access
2. **Twilio** - Phone number and API credentials
3. **PostgreSQL** - Database (Neon, Supabase, or local)
4. **SendGrid** - Email notifications (optional)
5. **OpenAI** - GPT-4o API (optional)

### Development Environment
- Node.js 18+ 
- TypeScript 4.9+
- VS Code (recommended)
- Git

## 🚀 Step-by-Step Rebuild Instructions

### 1. Project Initialization

```bash
# Create project directory
mkdir cardiocare-ai
cd cardiocare-ai

# Initialize package.json
npm init -y

# Install core dependencies
npm install express cors helmet morgan
npm install @types/node @types/express typescript tsx
npm install drizzle-orm drizzle-kit @neondatabase/serverless
npm install react react-dom @types/react @types/react-dom
npm install vite @vitejs/plugin-react
npm install tailwindcss postcss autoprefixer
npm install @tailwindcss/typography @tailwindcss/vite
npm install lucide-react class-variance-authority clsx tailwind-merge
npm install wouter @tanstack/react-query
npm install react-hook-form @hookform/resolvers zod drizzle-zod
npm install @radix-ui/react-dialog @radix-ui/react-button @radix-ui/react-form
npm install hume twilio @sendgrid/mail openai
npm install ws @types/ws multer @types/multer
```

### 2. Project Structure Setup

```
cardiocare-ai/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/           # Shadcn components
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Patients.tsx
│   │   │   ├── Calls.tsx
│   │   │   └── HumeIntegration.tsx
│   │   ├── lib/
│   │   │   ├── queryClient.ts
│   │   │   └── utils.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.html
├── server/
│   ├── core/                # NEW OOP ARCHITECTURE
│   │   ├── interfaces.ts
│   │   ├── CardioCareApp.ts
│   │   ├── ai-services/
│   │   │   └── HumeAIService.ts
│   │   ├── call-providers/
│   │   │   └── TwilioCallProvider.ts
│   │   ├── orchestration/
│   │   │   └── CallOrchestrator.ts
│   │   ├── document-management/
│   │   │   └── DocumentManager.ts
│   │   └── events/
│   │       └── EventHandler.ts
│   ├── services/            # Legacy services
│   ├── routes/              # API routes
│   ├── index.ts             # Legacy server
│   └── index-new.ts         # NEW OOP server
├── shared/
│   └── schema.ts            # Database schema
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

### 3. Database Schema (`shared/schema.ts`)

```typescript
import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const patients = pgTable('patients', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  dateOfBirth: text('date_of_birth'),
  phoneNumber: text('phone_number').notNull(),
  email: text('email'),
  medicalConditions: text('medical_conditions').array(),
  riskLevel: text('risk_level').notNull().default('medium'),
  customPrompt: text('custom_prompt'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const calls = pgTable('calls', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id),
  callSid: text('call_sid'),
  phoneNumber: text('phone_number').notNull(),
  status: text('status').notNull().default('initiated'),
  startTime: timestamp('start_time').defaultNow(),
  endTime: timestamp('end_time'),
  duration: integer('duration'),
  transcript: text('transcript'),
  aiAnalysis: jsonb('ai_analysis'),
  urgencyLevel: text('urgency_level').default('normal'),
  callType: text('call_type').default('automated'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const patientDocuments = pgTable('patient_documents', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id').notNull().references(() => patients.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  documentType: text('document_type').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Insert schemas
export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  createdAt: true,
});

export const insertDocumentSchema = createInsertSchema(patientDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Patient = typeof patients.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
```

### 4. Core Interfaces (`server/core/interfaces.ts`)

```typescript
// AI Service Interface
export interface IAIService {
  initialize(config: any): Promise<void>;
  generatePrompt(context: AIContext): Promise<string>;
  startConversation(context: AIContext): Promise<string>;
  processConversation(sessionId: string, input: any): Promise<AIResponse>;
  endConversation(sessionId: string): Promise<void>;
  getServiceStatus(): ServiceStatus;
}

// Call Provider Interface
export interface ICallProvider {
  initialize(config: any): Promise<void>;
  initiateCall(phoneNumber: string, webhookUrl: string): Promise<string>;
  updateCall(callSid: string, status: string): Promise<void>;
  terminateCall(callSid: string): Promise<void>;
  getCallStatus(callSid: string): Promise<CallStatus>;
}

// Call Orchestrator Interface
export interface ICallOrchestrator {
  startPatientCall(patientId: number, phoneNumber: string): Promise<CallSession>;
  updateCallStatus(callSid: string, status: string): Promise<void>;
  endCall(callSid: string): Promise<void>;
  getActiveCall(callSid: string): Promise<CallSession | null>;
  getActiveCalls(): Promise<CallSession[]>;
}

// Document Manager Interface
export interface IDocumentManager {
  addDocument(patientId: number, document: DocumentInput): Promise<PatientDocument>;
  getPatientDocuments(patientId: number): Promise<PatientDocument[]>;
  getDocument(documentId: number, patientId: number): Promise<PatientDocument | null>;
  updateDocument(documentId: number, patientId: number, updates: Partial<DocumentInput>): Promise<void>;
  deleteDocument(documentId: number, patientId: number): Promise<void>;
}

// Event Handler Interface
export interface IEventHandler {
  emit(event: SystemEvent): Promise<void>;
  on(eventType: string, handler: (payload: any) => Promise<void>): void;
  off(eventType: string, handler: (payload: any) => Promise<void>): void;
  getEventHistory(limit?: number): Promise<SystemEvent[]>;
}

// Supporting Types
export interface AIContext {
  patientId: number;
  patientData: Patient;
  documents: PatientDocument[];
  callPurpose: string;
  previousCalls?: Call[];
}

export interface CallSession {
  callSid: string;
  patientId: number;
  phoneNumber: string;
  status: string;
  startTime: Date;
  aiSessionId?: string;
  context: AIContext;
}

export type SystemEvent = 
  | { type: 'call_started'; payload: { callSid: string; patientId: number } }
  | { type: 'call_connected'; payload: { callSid: string } }
  | { type: 'call_ended'; payload: { callSid: string; duration: number } }
  | { type: 'urgent_alert'; payload: { patientId: number; urgencyLevel: string } }
  | { type: 'ai_analysis_complete'; payload: { callSid: string; analysis: any } }
  | { type: 'error'; payload: { error: string; context?: any } };
```

### 5. Main Application Class (`server/core/CardioCareApp.ts`)

```typescript
import { IAIService, ICallProvider, ICallOrchestrator, IDocumentManager, IEventHandler } from './interfaces';
import { HumeAIService } from './ai-services/HumeAIService';
import { TwilioCallProvider } from './call-providers/TwilioCallProvider';
import { CallOrchestrator } from './orchestration/CallOrchestrator';
import { DocumentManager } from './document-management/DocumentManager';
import { SystemEventHandler } from './events/EventHandler';

export interface CardioCareConfig {
  ai: {
    provider: 'hume' | 'openai';
    config: any;
  };
  call: {
    provider: 'twilio';
    config: any;
  };
  database: {
    url: string;
  };
  webhookBaseUrl: string;
  environment: 'development' | 'production';
}

export class CardioCareApp {
  private aiService: IAIService;
  private callProvider: ICallProvider;
  private orchestrator: ICallOrchestrator;
  private documentManager: IDocumentManager;
  private eventHandler: IEventHandler;
  private config: CardioCareConfig;
  private initialized = false;

  constructor(config: CardioCareConfig) {
    this.config = config;
    this.eventHandler = new SystemEventHandler();
    this.documentManager = new DocumentManager();
    
    // Initialize AI service based on config
    if (config.ai.provider === 'hume') {
      this.aiService = new HumeAIService();
    } else {
      throw new Error(`Unsupported AI provider: ${config.ai.provider}`);
    }
    
    // Initialize call provider
    this.callProvider = new TwilioCallProvider();
    
    // Initialize orchestrator
    this.orchestrator = new CallOrchestrator(
      this.aiService,
      this.callProvider,
      this.documentManager,
      this.eventHandler
    );
  }

  async initialize(): Promise<void> {
    console.log('[CARDIOCARE] Initializing application...');
    
    try {
      // Initialize all services
      await this.aiService.initialize(this.config.ai.config);
      await this.callProvider.initialize(this.config.call.config);
      await this.documentManager.initialize(this.config.database);
      await this.eventHandler.initialize();
      
      this.initialized = true;
      console.log('[CARDIOCARE] Application initialized successfully');
    } catch (error) {
      console.error('[CARDIOCARE] Initialization failed:', error);
      throw error;
    }
  }

  async startCall(patientId: number, phoneNumber: string): Promise<CallSession> {
    this.ensureInitialized();
    return this.orchestrator.startPatientCall(patientId, phoneNumber);
  }

  async getActiveCall(callSid: string): Promise<CallSession | null> {
    this.ensureInitialized();
    return this.orchestrator.getActiveCall(callSid);
  }

  async getActiveCalls(): Promise<CallSession[]> {
    this.ensureInitialized();
    return this.orchestrator.getActiveCalls();
  }

  async endCall(callSid: string): Promise<void> {
    this.ensureInitialized();
    return this.orchestrator.endCall(callSid);
  }

  getSystemHealth(): any {
    return {
      initialized: this.initialized,
      aiService: this.aiService.getServiceStatus(),
      callProvider: this.callProvider.getServiceStatus(),
      timestamp: new Date().toISOString(),
    };
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CardioCareApp not initialized. Call initialize() first.');
    }
  }
}
```

### 6. Hume AI Service (`server/core/ai-services/HumeAIService.ts`)

```typescript
import { Hume } from 'hume';
import { IAIService, AIContext, AIResponse, ServiceStatus } from '../interfaces';

export class HumeAIService implements IAIService {
  private client: Hume;
  private initialized = false;
  private activeConversations = new Map<string, any>();

  async initialize(config: { apiKey: string; temperature?: number }): Promise<void> {
    console.log('[HUME-AI] Initializing Hume AI service...');
    
    this.client = new Hume({
      apiKey: config.apiKey,
      // Additional configuration
    });
    
    this.initialized = true;
    console.log('[HUME-AI] Service initialized successfully');
  }

  async generatePrompt(context: AIContext): Promise<string> {
    const { patientData, documents, callPurpose } = context;
    
    const medicalInfo = documents
      .filter(doc => doc.documentType === 'medical_history')
      .map(doc => doc.content)
      .join('\n');

    const prompt = `
You are a compassionate healthcare assistant calling ${patientData.firstName} ${patientData.lastName} 
for a ${callPurpose} follow-up call.

Patient Information:
- Name: ${patientData.firstName} ${patientData.lastName}
- Medical Conditions: ${patientData.medicalConditions?.join(', ') || 'None specified'}
- Risk Level: ${patientData.riskLevel}

Available Documents:
${documents.map(doc => `- ${doc.title}: ${doc.content.substring(0, 200)}...`).join('\n')}

Instructions:
1. Be warm, empathetic, and professional
2. Ask about their current symptoms and medication compliance
3. Listen for any urgent concerns that need immediate attention
4. If urgent symptoms are mentioned, escalate immediately
5. Keep the conversation focused and under 10 minutes
6. Document all responses for healthcare provider review

Begin the call with a warm greeting and confirm you're speaking with the right person.
    `.trim();

    return prompt;
  }

  async startConversation(context: AIContext): Promise<string> {
    const prompt = await this.generatePrompt(context);
    
    // Create Hume EVI configuration
    const configId = await this.client.empathicVoice.configs.create({
      name: `Patient_${context.patientId}_${Date.now()}`,
      prompt: { text: prompt },
      voice: { provider: 'HUME_AI', name: 'ITO' }, // Normal male voice
      languageModel: {
        modelProvider: 'ANTHROPIC',
        modelResource: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
      },
    });

    this.activeConversations.set(configId, context);
    return configId;
  }

  async processConversation(sessionId: string, input: any): Promise<AIResponse> {
    // Process conversation through Hume EVI
    // This would handle the WebSocket connection and audio processing
    return {
      response: 'Processing...',
      urgencyLevel: 'normal',
      shouldContinue: true,
    };
  }

  async endConversation(sessionId: string): Promise<void> {
    this.activeConversations.delete(sessionId);
    console.log(`[HUME-AI] Conversation ${sessionId} ended`);
  }

  getServiceStatus(): ServiceStatus {
    return {
      initialized: this.initialized,
      activeConversations: this.activeConversations.size,
      service: 'hume-ai',
    };
  }
}
```

### 7. Twilio Call Provider (`server/core/call-providers/TwilioCallProvider.ts`)

```typescript
import twilio from 'twilio';
import { ICallProvider, CallStatus, ServiceStatus } from '../interfaces';

export class TwilioCallProvider implements ICallProvider {
  private client: twilio.Twilio;
  private phoneNumber: string;
  private initialized = false;

  async initialize(config: { 
    accountSid: string; 
    authToken: string; 
    phoneNumber: string; 
  }): Promise<void> {
    console.log('[TWILIO] Initializing Twilio call provider...');
    
    this.client = twilio(config.accountSid, config.authToken);
    this.phoneNumber = config.phoneNumber;
    this.initialized = true;
    
    console.log('[TWILIO] Call provider initialized successfully');
  }

  async initiateCall(phoneNumber: string, webhookUrl: string): Promise<string> {
    console.log(`[TWILIO] Initiating call to ${phoneNumber}`);
    
    const call = await this.client.calls.create({
      to: phoneNumber,
      from: this.phoneNumber,
      url: webhookUrl,
      method: 'POST',
      statusCallback: `${webhookUrl}/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });

    console.log(`[TWILIO] Call initiated with SID: ${call.sid}`);
    return call.sid;
  }

  async updateCall(callSid: string, status: string): Promise<void> {
    console.log(`[TWILIO] Updating call ${callSid} status to ${status}`);
    // Update call status in database or internal tracking
  }

  async terminateCall(callSid: string): Promise<void> {
    console.log(`[TWILIO] Terminating call ${callSid}`);
    
    await this.client.calls(callSid).update({ status: 'completed' });
  }

  async getCallStatus(callSid: string): Promise<CallStatus> {
    const call = await this.client.calls(callSid).fetch();
    
    return {
      callSid: call.sid,
      status: call.status,
      duration: call.duration ? parseInt(call.duration) : 0,
      startTime: call.dateCreated,
      endTime: call.dateUpdated,
    };
  }

  getServiceStatus(): ServiceStatus {
    return {
      initialized: this.initialized,
      service: 'twilio',
      phoneNumber: this.phoneNumber,
    };
  }
}
```

### 8. Frontend Setup (`client/src/App.tsx`)

```typescript
import React from 'react';
import { Route, Switch, Link } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import Dashboard from '@/pages/Dashboard';
import Patients from '@/pages/Patients';
import Calls from '@/pages/Calls';
import HumeIntegration from '@/pages/HumeIntegration';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <nav className="border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <h1 className="text-xl font-bold">CardioCare AI</h1>
              <div className="flex space-x-4">
                <Link href="/" className="text-sm hover:text-primary">Dashboard</Link>
                <Link href="/patients" className="text-sm hover:text-primary">Patients</Link>
                <Link href="/calls" className="text-sm hover:text-primary">Calls</Link>
                <Link href="/hume-integration" className="text-sm hover:text-primary">Hume Integration</Link>
              </div>
            </div>
          </div>
        </nav>
        
        <main className="container mx-auto px-4 py-8">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/patients" component={Patients} />
            <Route path="/calls" component={Calls} />
            <Route path="/hume-integration" component={HumeIntegration} />
          </Switch>
        </main>
        
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
```

### 9. Environment Configuration

Create `.env` file:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://username:password@localhost:5432/cardiocare

# Hume AI
HUME_API_KEY=your_hume_api_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# OpenAI (Optional)
OPENAI_API_KEY=your_openai_api_key

# SendGrid (Optional)
SENDGRID_API_KEY=your_sendgrid_api_key

# Application
WEBHOOK_BASE_URL=https://your-domain.com
```

### 10. Build Configuration

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "dev:oop": "NODE_ENV=development tsx server/index-new.ts",
    "build": "vite build",
    "start": "NODE_ENV=production node dist/server/index.js",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "type-check": "tsc --noEmit"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["client/src/*"],
      "@server/*": ["server/*"],
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["client/**/*", "server/**/*", "shared/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 11. Key Features Implementation

#### Patient Document Management
- Documents are stored per patient with strict isolation
- Each patient can only access their own documents
- Documents include discharge instructions, medication lists, care plans
- Full CRUD operations with audit trails

#### Hume AI Integration
- Emotional Voice Interface for natural conversations
- Configurable voice selection (ITO - normal male voice)
- Real-time audio processing with emotional intelligence
- Custom prompts based on patient medical history

#### Call Orchestration
- Automatic call initiation through Twilio
- Real-time audio streaming between patient and AI
- Conversation analysis and urgency detection
- Comprehensive call logging and transcript generation

#### Security & Privacy
- Patient data isolation with double verification
- Audit trails for all document access
- Secure API endpoints with proper authentication
- HIPAA-compliant data handling practices

### 12. Testing Strategy

#### Unit Tests
```typescript
// Example test structure
describe('CardioCareApp', () => {
  let app: CardioCareApp;
  
  beforeEach(() => {
    app = new CardioCareApp(testConfig);
  });
  
  it('should initialize successfully', async () => {
    await app.initialize();
    expect(app.getSystemHealth().initialized).toBe(true);
  });
});
```

#### Integration Tests
- Test complete call flows
- Verify data isolation
- Test AI service integration
- Validate Twilio webhook processing

### 13. Deployment Instructions

#### Development
```bash
npm run dev:oop  # Run new OOP server
npm run dev      # Run legacy server
```

#### Production
```bash
npm run build
npm start
```

#### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## 🔧 Troubleshooting Guide

### Common Issues

1. **Database Connection Errors**
   - Verify DATABASE_URL is correct
   - Run `npm run db:push` to sync schema

2. **API Key Issues**
   - Check all environment variables are set
   - Verify API key permissions and quotas

3. **Webhook Problems**
   - Ensure webhook URLs are publicly accessible
   - Check Twilio webhook configuration

4. **Audio Processing Issues**
   - Verify Hume AI API key and permissions
   - Check WebSocket connection handling

### Debug Commands
```bash
# Type checking
npm run type-check

# Database operations
npm run db:studio

# Check service status
curl http://localhost:5000/api/health
```

## 📊 Monitoring & Analytics

### Key Metrics
- Call success rates
- Patient response compliance
- AI conversation quality
- System performance metrics

### Logging Strategy
- Structured logging with timestamps
- Error tracking with context
- Performance monitoring
- Audit trails for compliance

## 🚀 Future Enhancements

### Scalability Improvements
- Microservices architecture
- Load balancing
- Database sharding
- Caching strategies

### Feature Additions
- Multi-language support
- Advanced analytics dashboard
- Integration with EHR systems
- Mobile application

### AI Enhancements
- Multiple AI provider support
- Advanced emotion detection
- Predictive analytics
- Personalized conversation flows

---

This comprehensive rebuild guide provides everything needed to recreate the CardioCare AI system from scratch, maintaining the object-oriented architecture, patient data isolation, and Hume AI + Twilio integration pipeline.