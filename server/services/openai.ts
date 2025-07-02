import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
let openai: OpenAI | null = null;

// Initialize OpenAI only if API key is available
if (process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR) {
  openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR 
  });
  console.log('[OPENAI] Service initialized with API key');
} else {
  console.log('[OPENAI] API key not provided, OpenAI services will be disabled');
}

export interface PatientCallAnalysis {
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  symptoms: string[];
  concerns: string[];
  followUpRequired: boolean;
  escalateToProvider: boolean;
  summary: string;
  nextQuestions: string[];
}

export interface CallTranscription {
  text: string;
  speaker: 'ai' | 'patient';
  timestamp: Date;
}

export class OpenAIService {
  async generateCallScript(
    patientName: string, 
    condition: string, 
    callType: string,
    voicePersonality?: { tone: string; pace: string; formality: string }
  ): Promise<string> {
    try {
      const personality = voicePersonality || { tone: 'empathetic', pace: 'normal', formality: 'conversational' };
      
      const prompt = `You are a CardioCare virtual health assistant. Generate a ${personality.tone} and ${personality.formality} greeting for ${patientName} with ${condition}.

      Voice Personality Guidelines:
      - Tone: ${personality.tone} (adjust warmth and clinical approach accordingly)
      - Pace: ${personality.pace} (affect sentence structure and complexity)
      - Formality: ${personality.formality} (adjust language register)
      
      Clinical Focus Areas:
      - Primary condition: ${condition}
      - Call type: ${callType}
      - Patient name: ${patientName}
      
      Requirements:
      1. Start with personalized greeting using patient name
      2. Reference their specific condition naturally
      3. Ask 1-2 focused questions about current symptoms or well-being
      4. Use natural, conversational language appropriate for voice delivery
      5. Keep total response under 150 words for voice clarity
      6. Include transition phrases for natural speech flow
      
      Format: Return only the spoken greeting and first question.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      });

      return response.choices[0].message.content || "Hello, this is your CardioCare follow-up assistant. How are you feeling today?";
    } catch (error) {
      console.error('OpenAI script generation error:', error);
      throw new Error(`Failed to generate call script: ${error.message}`);
    }
  }

  async analyzePatientResponse(
    transcript: string, 
    patientCondition: string,
    conversationHistory: CallTranscription[] = []
  ): Promise<PatientCallAnalysis> {
    try {
      // Handle undefined transcript
      if (!transcript || transcript.trim() === '') {
        return {
          urgencyLevel: 'low',
          symptoms: [],
          concerns: [],
          followUpRequired: false,
          escalateToProvider: false,
          summary: 'No patient response received',
          nextQuestions: ['How are you feeling today?']
        };
      }

      const conversationContext = conversationHistory
        .map(t => `${t.speaker.toUpperCase()}: ${t.text}`)
        .join('\n');

      const prompt = `As a clinical AI assistant, analyze this patient conversation for a ${patientCondition} patient:

      Previous conversation:
      ${conversationContext}
      
      Latest patient response: "${transcript}"
      
      Analyze for:
      1. Urgency level (low/medium/high/critical)
      2. Symptoms mentioned
      3. Medical concerns
      4. Need for provider escalation
      5. Follow-up requirements
      6. Brief summary
      7. Suggested next questions
      
      Respond with JSON in this exact format:
      {
        "urgencyLevel": "low|medium|high|critical",
        "symptoms": ["symptom1", "symptom2"],
        "concerns": ["concern1", "concern2"],
        "followUpRequired": true|false,
        "escalateToProvider": true|false,
        "summary": "Brief summary of patient status",
        "nextQuestions": ["question1", "question2"]
      }`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      return analysis as PatientCallAnalysis;
    } catch (error) {
      console.error('OpenAI analysis error:', error);
      throw new Error(`Failed to analyze patient response: ${error.message}`);
    }
  }

  async generateFollowUpResponse(
    analysis: PatientCallAnalysis,
    patientCondition: string
  ): Promise<string> {
    try {
      const prompt = `Based on this clinical analysis for a ${patientCondition} patient:
      
      Urgency: ${analysis.urgencyLevel}
      Symptoms: ${analysis.symptoms.join(', ')}
      Concerns: ${analysis.concerns.join(', ')}
      
      Generate an appropriate follow-up response. If urgency is high/critical, show concern and ask clarifying questions. If low/medium, provide reassurance and continue assessment.
      
      Keep response under 100 words and speak naturally.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
      });

      return response.choices[0].message.content || "Thank you for sharing that information. Let me ask you a few more questions.";
    } catch (error) {
      console.error('OpenAI follow-up generation error:', error);
      throw new Error(`Failed to generate follow-up response: ${error.message}`);
    }
  }

  async transcribeSpeech(audioBuffer: Buffer): Promise<string> {
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioBuffer], "audio.wav", { type: "audio/wav" }),
        model: "whisper-1",
      });

      return transcription.text;
    } catch (error) {
      console.error('OpenAI transcription error:', error);
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  async generateSpeech(text: string): Promise<Buffer> {
    try {
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
      });

      return Buffer.from(await mp3.arrayBuffer());
    } catch (error) {
      console.error('OpenAI speech generation error:', error);
      throw new Error(`Failed to generate speech: ${error.message}`);
    }
  }
}

export const openaiService = new OpenAIService();
