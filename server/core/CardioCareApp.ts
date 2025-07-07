/**
 * CardioCare AI Application Factory
 * Main application class that orchestrates AI services and call providers
 */

import { HumeAIService } from './ai-services/HumeAIService';
import { TwilioCallProvider } from './call-providers/TwilioCallProvider';
import { CallOrchestrator } from './orchestration/CallOrchestrator';
import { DocumentManager } from './document-management/DocumentManager';
import { SystemEventHandler } from './events/EventHandler';
import { Logger } from '../utils/logger';
import { 
  IAIService, 
  ICallProvider, 
  ICallOrchestrator, 
  IDocumentManager,
  IEventHandler,
  AIServiceConfig,
  CallProviderConfig 
} from './interfaces';

export interface CardioCareConfig {
  ai: {
    provider: 'hume' | 'openai';
    config: AIServiceConfig;
  };
  call: {
    provider: 'twilio';
    config: CallProviderConfig;
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
  private logger: Logger;
  private config: CardioCareConfig;
  private initialized: boolean = false;

  constructor(config: CardioCareConfig) {
    this.config = config;
    this.logger = new Logger('CardioCareApp');
    
    // Initialize services
    this.aiService = this.createAIService();
    this.callProvider = this.createCallProvider();
    this.documentManager = new DocumentManager();
    this.eventHandler = new SystemEventHandler();
    
    // Initialize orchestrator with dependencies
    this.orchestrator = new CallOrchestrator(
      this.aiService,
      this.callProvider,
      this.documentManager
    );
    
    // Connect event handler
    this.orchestrator.addEventHandler(this.eventHandler);
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing CardioCare AI application...');
      
      // Initialize AI service
      await this.aiService.initialize(this.config.ai.config);
      this.logger.info(`AI service (${this.config.ai.provider}) initialized`);
      
      // Initialize call provider
      await this.callProvider.initialize(this.config.call.config);
      this.logger.info(`Call provider (${this.config.call.provider}) initialized`);
      
      this.initialized = true;
      this.logger.info('CardioCare AI application initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize CardioCare application:', error);
      throw error;
    }
  }

  /**
   * Start a patient call
   */
  async startCall(patientId: string, phoneNumber: string) {
    this.ensureInitialized();
    return await this.orchestrator.startPatientCall(patientId, phoneNumber);
  }

  /**
   * Handle call status updates
   */
  async handleCallUpdate(callSid: string, status: string): Promise<void> {
    this.ensureInitialized();
    return await this.orchestrator.handleCallUpdate(callSid, status);
  }

  /**
   * End a call
   */
  async endCall(callSid: string) {
    this.ensureInitialized();
    return await this.orchestrator.endCall(callSid);
  }

  /**
   * Get active calls
   */
  getActiveCalls() {
    this.ensureInitialized();
    return this.orchestrator.getActiveCalls();
  }

  /**
   * Get orchestrator instance
   */
  getOrchestrator(): ICallOrchestrator {
    this.ensureInitialized();
    return this.orchestrator;
  }

  /**
   * Get document manager instance
   */
  getDocumentManager(): IDocumentManager {
    this.ensureInitialized();
    return this.documentManager;
  }

  /**
   * Get AI service instance
   */
  getAIService(): IAIService {
    this.ensureInitialized();
    return this.aiService;
  }

  /**
   * Get call provider instance
   */
  getCallProvider(): ICallProvider {
    this.ensureInitialized();
    return this.callProvider;
  }

  /**
   * Get system health status
   */
  getSystemHealth() {
    return {
      initialized: this.initialized,
      aiService: this.aiService.isAvailable(),
      callProvider: this.callProvider.isAvailable(),
      environment: this.config.environment,
      timestamp: new Date(),
    };
  }

  /**
   * Shutdown the application
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info('Shutting down CardioCare application...');
      
      // Clean up active calls
      this.orchestrator.cleanupCompletedCalls();
      
      // Additional cleanup logic here
      
      this.initialized = false;
      this.logger.info('CardioCare application shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during shutdown:', error);
    }
  }

  /**
   * Create AI service based on configuration
   */
  private createAIService(): IAIService {
    switch (this.config.ai.provider) {
      case 'hume':
        return new HumeAIService();
      case 'openai':
        // Would implement OpenAI service here
        throw new Error('OpenAI service not implemented in this version');
      default:
        throw new Error(`Unsupported AI provider: ${this.config.ai.provider}`);
    }
  }

  /**
   * Create call provider based on configuration
   */
  private createCallProvider(): ICallProvider {
    switch (this.config.call.provider) {
      case 'twilio':
        return new TwilioCallProvider();
      default:
        throw new Error(`Unsupported call provider: ${this.config.call.provider}`);
    }
  }

  /**
   * Ensure application is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CardioCare application not initialized. Call initialize() first.');
    }
  }
}

/**
 * Factory function to create CardioCare application instance
 */
export function createCardioCareApp(config: CardioCareConfig): CardioCareApp {
  return new CardioCareApp(config);
}

/**
 * Helper function to create configuration from environment variables
 */
export function createConfigFromEnv(): CardioCareConfig {
  const humeApiKey = process.env.HUME_API_KEY;
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://your-app.replit.app';
  const environment = (process.env.NODE_ENV as 'development' | 'production') || 'development';

  if (!humeApiKey) {
    throw new Error('HUME_API_KEY environment variable is required');
  }

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    throw new Error('Twilio credentials are required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
  }

  return {
    ai: {
      provider: 'hume',
      config: {
        apiKey: humeApiKey,
        temperature: 0.7,
        voiceId: 'ITO', // Normal male voice
      },
    },
    call: {
      provider: 'twilio',
      config: {
        accountSid: twilioAccountSid,
        authToken: twilioAuthToken,
        phoneNumber: twilioPhoneNumber,
      },
    },
    webhookBaseUrl,
    environment,
  };
}