/**
 * CardioCare AI Server - New OOP Architecture
 * Main server entry point using object-oriented design
 */

import express from 'express';
import { createServer } from 'http';
import { CardioCareApp, createConfigFromEnv } from './core/CardioCareApp';
import { Logger } from './utils/logger';
import path from 'path';
import cors from 'cors';

// Legacy imports for API routes (to be refactored)
import { setupStaticRoutes } from './routes';
import { setupRealtimeRoutes } from './routes-realtime';
import { setupTwilioIntegrationRoutes } from './routes-twilio-integration';
import { setupHumeIntegrationRoutes } from './routes-hume-integration';
import { setupSMSRoutes } from './routes-sms';
import { setupVoicePipelineRoutes } from './routes-voice-pipeline';
import { setupBasicRoutes } from './routes-basic-voice';
import { setupCallingRoutes } from './routes-calling';
import { setupCSVImportRoutes } from './routes-csv-import';
import { setupPromptTemplateRoutes } from './routes-prompt-templates';
import { setupPatientPromptRoutes } from './routes-patient-prompts';

// Database and storage
import { db } from './db';
import { initializeDatabase } from './storage';

const logger = new Logger('Server');

class CardioCareServer {
  private app: express.Application;
  private server: any;
  private cardioCareApp: CardioCareApp;
  private port: number;

  constructor() {
    this.port = parseInt(process.env.PORT || '5000', 10);
    this.app = express();
    this.server = createServer(this.app);
    
    // Initialize CardioCare application
    try {
      const config = createConfigFromEnv();
      this.cardioCareApp = new CardioCareApp(config);
      logger.info('CardioCare application created successfully');
    } catch (error) {
      logger.error('Failed to create CardioCare application:', error);
      process.exit(1);
    }
  }

  async initialize(): Promise<void> {
    try {
      // Initialize database
      await initializeDatabase();
      logger.info('Database initialized');

      // Initialize CardioCare application
      await this.cardioCareApp.initialize();
      logger.info('CardioCare application initialized');

      // Setup Express middleware
      this.setupMiddleware();

      // Setup API routes
      await this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      logger.info('Server initialization complete');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  private setupMiddleware(): void {
    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL || 'https://your-app.replit.app'
        : true,
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(express.raw({ type: 'audio/x-mulaw', limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
      });
      next();
    });
  }

  private async setupRoutes(): Promise<void> {
    // New OOP API routes
    this.setupCoreAPIRoutes();

    // Legacy API routes (to be gradually refactored)
    await this.setupLegacyRoutes();

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../client/dist')));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../client/dist/index.html'));
      });
    }
  }

  private setupCoreAPIRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      const health = this.cardioCareApp.getSystemHealth();
      res.json(health);
    });

    // Core call management endpoints
    this.app.post('/api/core/calls/start', async (req, res) => {
      try {
        const { patientId, phoneNumber } = req.body;
        
        if (!patientId || !phoneNumber) {
          return res.status(400).json({ error: 'Patient ID and phone number are required' });
        }

        const callSession = await this.cardioCareApp.startCall(patientId, phoneNumber);
        res.json(callSession);
      } catch (error) {
        logger.error('Failed to start call:', error);
        res.status(500).json({ error: 'Failed to start call' });
      }
    });

    this.app.post('/api/core/calls/:callSid/update', async (req, res) => {
      try {
        const { callSid } = req.params;
        const { status } = req.body;
        
        await this.cardioCareApp.handleCallUpdate(callSid, status);
        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to update call:', error);
        res.status(500).json({ error: 'Failed to update call' });
      }
    });

    this.app.post('/api/core/calls/:callSid/end', async (req, res) => {
      try {
        const { callSid } = req.params;
        
        const callSession = await this.cardioCareApp.endCall(callSid);
        res.json(callSession);
      } catch (error) {
        logger.error('Failed to end call:', error);
        res.status(500).json({ error: 'Failed to end call' });
      }
    });

    this.app.get('/api/core/calls/active', (req, res) => {
      try {
        const activeCalls = this.cardioCareApp.getActiveCalls();
        res.json(activeCalls);
      } catch (error) {
        logger.error('Failed to get active calls:', error);
        res.status(500).json({ error: 'Failed to get active calls' });
      }
    });

    // Document management endpoints
    this.app.post('/api/core/documents', async (req, res) => {
      try {
        const { patientId, title, content, type } = req.body;
        
        if (!patientId || !title || !content || !type) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        const documentManager = this.cardioCareApp.getDocumentManager();
        const document = await documentManager.addDocument(patientId, { title, content, type });
        res.json(document);
      } catch (error) {
        logger.error('Failed to add document:', error);
        res.status(500).json({ error: 'Failed to add document' });
      }
    });

    this.app.get('/api/core/documents/:patientId', async (req, res) => {
      try {
        const { patientId } = req.params;
        
        const documentManager = this.cardioCareApp.getDocumentManager();
        const documents = await documentManager.getPatientDocuments(patientId);
        res.json(documents);
      } catch (error) {
        logger.error('Failed to get documents:', error);
        res.status(500).json({ error: 'Failed to get documents' });
      }
    });

    this.app.delete('/api/core/documents/:documentId', async (req, res) => {
      try {
        const { documentId } = req.params;
        
        const documentManager = this.cardioCareApp.getDocumentManager();
        await documentManager.deleteDocument(documentId);
        res.json({ success: true });
      } catch (error) {
        logger.error('Failed to delete document:', error);
        res.status(500).json({ error: 'Failed to delete document' });
      }
    });

    // AI service endpoints
    this.app.post('/api/core/ai/generate-prompt', async (req, res) => {
      try {
        const { patientId } = req.body;
        
        if (!patientId) {
          return res.status(400).json({ error: 'Patient ID is required' });
        }

        const orchestrator = this.cardioCareApp.getOrchestrator();
        const context = await orchestrator.getPatientContext(patientId);
        
        const aiService = this.cardioCareApp.getAIService();
        const prompt = await aiService.generatePrompt(context);
        
        res.json({ prompt });
      } catch (error) {
        logger.error('Failed to generate prompt:', error);
        res.status(500).json({ error: 'Failed to generate prompt' });
      }
    });
  }

  private async setupLegacyRoutes(): Promise<void> {
    // Setup legacy routes (gradually being refactored)
    await setupStaticRoutes(this.app);
    await setupRealtimeRoutes(this.app, this.server);
    await setupTwilioIntegrationRoutes(this.app);
    await setupHumeIntegrationRoutes(this.app);
    await setupSMSRoutes(this.app);
    await setupVoicePipelineRoutes(this.app);
    await setupBasicRoutes(this.app);
    await setupCallingRoutes(this.app);
    await setupCSVImportRoutes(this.app);
    await setupPromptTemplateRoutes(this.app);
    await setupPatientPromptRoutes(this.app);
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      
      if (res.headersSent) {
        return next(error);
      }
      
      res.status(500).json({ 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      });
    });
  }

  async start(): Promise<void> {
    try {
      await this.initialize();
      
      this.server.listen(this.port, '0.0.0.0', () => {
        logger.info(`Server running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
        logger.info(`Health check: http://localhost:${this.port}/api/health`);
      });

      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Close server
        this.server.close(() => {
          logger.info('HTTP server closed');
        });

        // Shutdown CardioCare application
        await this.cardioCareApp.shutdown();
        
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Start server
const server = new CardioCareServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export { CardioCareServer };