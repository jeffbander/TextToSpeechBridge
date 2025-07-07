/**
 * Hume AI EVI Service Implementation
 * Handles real-time voice conversations with emotional intelligence
 */

import { Hume, HumeApi } from 'hume';
import { IAIService, AIServiceConfig, ConversationContext, PatientDocument } from '../interfaces';
import { Logger } from '../../utils/logger';

export class HumeAIService implements IAIService {
  private client: HumeApi | null = null;
  private activeConfigs: Map<string, any> = new Map();
  private activeSessions: Map<string, any> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('HumeAIService');
  }

  async initialize(config: AIServiceConfig): Promise<void> {
    try {
      if (!config.apiKey) {
        throw new Error('Hume API key is required');
      }

      this.client = new HumeApi({
        apiKey: config.apiKey,
      });

      this.logger.info('Hume AI service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Hume AI service:', error);
      throw error;
    }
  }

  async generatePrompt(context: ConversationContext): Promise<string> {
    const { patientName, medicalCondition, riskLevel, documents, customPrompt } = context;
    
    // Compile patient-specific information
    const documentSummary = documents.map(doc => 
      `${doc.type.toUpperCase()}: ${doc.title}\n${doc.content}`
    ).join('\n\n');

    const basePrompt = `You are a compassionate AI healthcare assistant conducting a follow-up call with ${patientName}.

PATIENT INFORMATION:
- Name: ${patientName}
- Medical Condition: ${medicalCondition}
- Risk Level: ${riskLevel}

PATIENT DOCUMENTS:
${documentSummary}

CONVERSATION GUIDELINES:
1. Be empathetic and professional
2. Ask about symptoms, medication compliance, and overall wellbeing
3. Listen for concerning symptoms that might require immediate attention
4. Reference specific information from the patient's documents when relevant
5. Keep responses concise and natural
6. If patient reports serious symptoms, escalate appropriately

URGENCY INDICATORS:
- Chest pain, shortness of breath, severe dizziness
- Medication non-compliance
- Worsening symptoms
- Mental health concerns

Begin the conversation with a warm greeting and ask how they're feeling today.`;

    return customPrompt || basePrompt;
  }

  async startConversation(context: ConversationContext): Promise<string> {
    try {
      if (!this.client) {
        throw new Error('Hume AI client not initialized');
      }

      const prompt = await this.generatePrompt(context);
      
      // Create EVI configuration
      const config = {
        name: `Patient Call - ${context.patientName}`,
        description: `Healthcare follow-up call for ${context.patientName}`,
        eviVersion: "2",
        prompt: { text: prompt },
        voice: {
          provider: "HUME_AI" as const,
          name: "ITO", // Normal male voice
        },
        languageModel: {
          modelProvider: "ANTHROPIC" as const,
          modelResource: "claude-3-5-sonnet-20241022",
          temperature: 0.7,
        },
      };

      // Create configuration
      const configResponse = await this.client.empathicVoice.configs.createConfig(config);
      const configId = configResponse.id;

      this.activeConfigs.set(context.patientId, { configId, config });
      
      this.logger.info(`Started Hume conversation for patient ${context.patientId} with config ${configId}`);
      
      return configId;
    } catch (error) {
      this.logger.error('Failed to start Hume conversation:', error);
      throw error;
    }
  }

  async processAudioStream(audioData: Buffer, sessionId: string): Promise<Buffer> {
    try {
      // For Hume AI, audio processing is handled via WebSocket in real-time
      // This method would be used for additional processing if needed
      this.logger.debug(`Processing audio stream for session ${sessionId}`);
      return audioData;
    } catch (error) {
      this.logger.error('Failed to process audio stream:', error);
      throw error;
    }
  }

  async analyzeConversation(transcript: string, context: ConversationContext): Promise<{
    summary: string;
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendations: string[];
    followUpRequired: boolean;
  }> {
    try {
      // Use Hume's analysis capabilities or implement custom analysis
      const analysis = {
        summary: this.generateSummary(transcript, context),
        urgencyLevel: this.assessUrgency(transcript) as 'low' | 'medium' | 'high' | 'critical',
        recommendations: this.generateRecommendations(transcript, context),
        followUpRequired: this.shouldFollowUp(transcript, context),
      };

      this.logger.info(`Analyzed conversation for patient ${context.patientId}`);
      return analysis;
    } catch (error) {
      this.logger.error('Failed to analyze conversation:', error);
      throw error;
    }
  }

  async endConversation(sessionId: string): Promise<void> {
    try {
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.delete(sessionId);
        this.logger.info(`Ended Hume conversation session ${sessionId}`);
      }
    } catch (error) {
      this.logger.error('Failed to end conversation:', error);
      throw error;
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  // Helper methods
  private generateSummary(transcript: string, context: ConversationContext): string {
    const lines = transcript.split('\n').filter(line => line.trim());
    const patientResponses = lines.filter(line => !line.startsWith('Assistant:'));
    
    if (patientResponses.length === 0) {
      return 'No patient response recorded';
    }

    return `Patient ${context.patientName} was reached for follow-up regarding ${context.medicalCondition}. Key points from conversation: ${patientResponses.slice(0, 3).join(' ')}`;
  }

  private assessUrgency(transcript: string): string {
    const urgentKeywords = ['chest pain', 'can\'t breathe', 'severe', 'emergency', 'hospital'];
    const highKeywords = ['pain', 'worse', 'bad', 'dizzy', 'confused'];
    const mediumKeywords = ['tired', 'concerned', 'worried', 'different'];

    const lowerTranscript = transcript.toLowerCase();

    if (urgentKeywords.some(keyword => lowerTranscript.includes(keyword))) {
      return 'critical';
    } else if (highKeywords.some(keyword => lowerTranscript.includes(keyword))) {
      return 'high';
    } else if (mediumKeywords.some(keyword => lowerTranscript.includes(keyword))) {
      return 'medium';
    }

    return 'low';
  }

  private generateRecommendations(transcript: string, context: ConversationContext): string[] {
    const recommendations: string[] = [];
    const lowerTranscript = transcript.toLowerCase();

    if (lowerTranscript.includes('medication') || lowerTranscript.includes('pills')) {
      recommendations.push('Review medication adherence');
    }

    if (lowerTranscript.includes('pain') || lowerTranscript.includes('discomfort')) {
      recommendations.push('Assess pain management strategy');
    }

    if (lowerTranscript.includes('appointment') || lowerTranscript.includes('doctor')) {
      recommendations.push('Schedule follow-up appointment');
    }

    if (context.riskLevel === 'high' && recommendations.length === 0) {
      recommendations.push('Continue monitoring due to high risk level');
    }

    return recommendations.length > 0 ? recommendations : ['Standard follow-up care'];
  }

  private shouldFollowUp(transcript: string, context: ConversationContext): boolean {
    const followUpTriggers = ['pain', 'worse', 'concerned', 'question', 'help'];
    const lowerTranscript = transcript.toLowerCase();

    return followUpTriggers.some(trigger => lowerTranscript.includes(trigger)) || 
           context.riskLevel === 'high';
  }

  // Public method to get active configuration
  getActiveConfig(patientId: string): any {
    return this.activeConfigs.get(patientId);
  }

  // Public method to create WebSocket connection URL
  getWebSocketUrl(configId: string): string {
    return `wss://api.hume.ai/v0/evi/chat?config_id=${configId}`;
  }
}