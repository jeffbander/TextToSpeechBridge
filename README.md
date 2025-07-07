# CardioCare AI - Object-Oriented Healthcare Automation Platform

A comprehensive, object-oriented healthcare automation system that enables automated patient follow-up calls using AI voice technology with strict patient data isolation.

## 🏗️ Object-Oriented Architecture

### Core Design Principles

- **Separation of Concerns**: AI services, call providers, and orchestration logic are completely separated
- **Interface-Driven Development**: All components implement well-defined interfaces for maximum flexibility
- **Dependency Injection**: Services are injected into the main application for easy testing and swapping
- **Event-Driven Architecture**: System-wide events for monitoring, alerts, and analytics
- **Strict Data Isolation**: Patient documents are completely isolated with access control

### Architecture Overview

```
CardioCareApp (Main Application)
├── AI Services
│   ├── HumeAIService (implements IAIService)
│   └── OpenAIService (implements IAIService)
├── Call Providers
│   ├── TwilioCallProvider (implements ICallProvider)
│   └── Other providers...
├── Orchestration
│   └── CallOrchestrator (coordinates AI + calls)
├── Document Management
│   └── DocumentManager (patient data isolation)
└── Event Handling
    └── SystemEventHandler (alerts, notifications)
```

## 🚀 Quick Start

### For VS Code Development

1. **Clone the repository**
2. **Install dependencies:** `npm install`
3. **Setup environment variables** (see `.env.example`)
4. **Start development server:** Press F5 in VS Code or run `tsx server/index-new.ts`

### For Replit

1. **Import the project to Replit**
2. **Set environment secrets** in Replit
3. **Run:** Use the "Start application" workflow

## 📁 Project Structure

```
├── server/core/                    # NEW: Object-Oriented Core
│   ├── interfaces.ts               # Core interfaces and contracts
│   ├── CardioCareApp.ts           # Main application class
│   ├── ai-services/               # AI service implementations
│   │   └── HumeAIService.ts       # Hume AI integration
│   ├── call-providers/            # Call provider implementations
│   │   └── TwilioCallProvider.ts  # Twilio integration
│   ├── orchestration/             # Business logic coordination
│   │   └── CallOrchestrator.ts    # Main orchestration logic
│   ├── document-management/       # Patient document system
│   │   └── DocumentManager.ts     # Document management with isolation
│   └── events/                    # Event handling system
│       └── EventHandler.ts        # System event processing
├── server/                        # Legacy server code (being refactored)
├── client/                        # React frontend
├── shared/                        # Shared TypeScript definitions
└── docs/                          # Documentation and flowcharts
```

## 🔧 Core Classes

### CardioCareApp
**Main application factory that orchestrates all services**

```typescript
const app = new CardioCareApp(config);
await app.initialize();

// Start a patient call
const callSession = await app.startCall(patientId, phoneNumber);

// Get system health
const health = app.getSystemHealth();
```

### HumeAIService
**AI service implementation with emotional intelligence**

```typescript
const aiService = new HumeAIService();
await aiService.initialize({ apiKey: 'your-key' });

// Generate personalized prompt
const prompt = await aiService.generatePrompt(context);

// Start conversation
const configId = await aiService.startConversation(context);
```

### TwilioCallProvider
**Call provider for telephone integration**

```typescript
const callProvider = new TwilioCallProvider();
await callProvider.initialize(twilioConfig);

// Initiate call
const callSid = await callProvider.initiateCall(phoneNumber, webhookUrl);
```

### CallOrchestrator
**Coordinates AI services and call providers**

```typescript
const orchestrator = new CallOrchestrator(aiService, callProvider, documentManager);

// Start patient call with full orchestration
const session = await orchestrator.startPatientCall(patientId, phoneNumber);
```

### DocumentManager
**Patient document management with strict data isolation**

```typescript
const docManager = new DocumentManager();

// Add patient document
const document = await docManager.addDocument(patientId, {
  title: 'Discharge Instructions',
  content: 'Patient care instructions...',
  type: 'discharge_instructions'
});

// Get patient documents (only their own)
const documents = await docManager.getPatientDocuments(patientId);
```

## 🔄 Call Flow

1. **Call Initiation**: `CardioCareApp.startCall()`
2. **Context Building**: Gather patient documents and medical history
3. **AI Prompt Generation**: Create personalized conversation prompt
4. **Call Provider Setup**: Configure Twilio call with webhooks
5. **Real-time Processing**: Stream audio between patient and AI
6. **Conversation Analysis**: AI analyzes conversation for urgency
7. **Event Emission**: Trigger alerts, notifications, and logging
8. **Cleanup**: Properly terminate all connections

## 🛡️ Security & Data Isolation

### Patient Data Protection
- **Document Isolation**: Each patient can only access their own documents
- **Access Control**: Double verification of patient ID on all document operations
- **Audit Trails**: All document access is logged
- **Secure Storage**: Documents stored with encryption at rest

### Code Example: Data Isolation
```typescript
// This will only return documents for the specified patient
const documents = await documentManager.getPatientDocuments(patientId);

// This will fail if document doesn't belong to patient
const document = await documentManager.getDocument(documentId, patientId);
```

## 📊 System Events

The system emits events for monitoring and automation:

```typescript
// Event types
type SystemEvent = 
  | { type: 'call_started'; payload: { callSid: string; patientId: string } }
  | { type: 'call_connected'; payload: { callSid: string } }
  | { type: 'call_ended'; payload: { callSid: string; duration: number } }
  | { type: 'urgent_alert'; payload: { patientId: string; urgencyLevel: string } }
  | { type: 'ai_analysis_complete'; payload: { callSid: string; analysis: any } }
  | { type: 'error'; payload: { error: string; context?: any } };
```

## 🧪 Testing

### Unit Tests
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

### Integration Tests
```bash
npm run test:integration   # Test full workflows
```

### Manual Testing
```bash
tsx server/index-new.ts    # Start new OOP server
curl http://localhost:5000/api/health  # Health check
```

## 🚀 Deployment

### VS Code Standalone
1. Set environment variables in `.env`
2. Run `tsx server/index-new.ts`
3. Access at `http://localhost:5000`

### Production Deployment
1. Build: `npm run build`
2. Start: `npm start`
3. Configure reverse proxy (nginx, etc.)

### Docker Deployment
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

## 📈 Performance Considerations

- **Connection Pooling**: Database connections are pooled and reused
- **Memory Management**: Active calls are cleaned up automatically
- **Caching**: Patient documents are cached during call sessions
- **Rate Limiting**: API endpoints have rate limiting for protection
- **Load Balancing**: Application supports horizontal scaling

## 🔧 Configuration

### Environment Variables
```env
# Core Configuration
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://...

# AI Services
HUME_API_KEY=your_hume_key
OPENAI_API_KEY=your_openai_key

# Call Provider
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number

# Application
WEBHOOK_BASE_URL=https://your-domain.com
```

### Service Configuration
```typescript
const config: CardioCareConfig = {
  ai: {
    provider: 'hume',
    config: { apiKey: process.env.HUME_API_KEY, temperature: 0.7 }
  },
  call: {
    provider: 'twilio',
    config: { 
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER
    }
  },
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
  environment: 'production'
};
```

## 📚 API Documentation

### Core API Endpoints

#### Health Check
```http
GET /api/health
```

#### Start Patient Call
```http
POST /api/core/calls/start
Content-Type: application/json

{
  "patientId": "patient-123",
  "phoneNumber": "+1234567890"
}
```

#### Get Active Calls
```http
GET /api/core/calls/active
```

#### Document Management
```http
POST /api/core/documents
Content-Type: application/json

{
  "patientId": "patient-123",
  "title": "Medication List",
  "content": "Patient medications...",
  "type": "medication_list"
}
```

## 🤝 Contributing

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/your-feature`
3. **Follow OOP principles**: Implement interfaces, use dependency injection
4. **Add tests**: Ensure good test coverage
5. **Update documentation**: Include flowcharts and API docs
6. **Submit pull request**

## 🐛 Troubleshooting

### Common Issues

**TypeScript Errors**
```bash
npm run type-check  # Check for type errors
```

**Database Connection**
```bash
npm run db:push     # Sync database schema
```

**API Key Issues**
- Verify keys in environment variables
- Check API key permissions and quotas

**Call Provider Issues**
- Verify webhook URLs are publicly accessible
- Check Twilio account status and phone number verification

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: See `/docs` folder for detailed guides
- **Issues**: Report bugs in GitHub Issues
- **Architecture**: See `ARCHITECTURE_FLOWCHARTS.md` for system diagrams