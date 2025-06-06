export interface ConversationPrompts {
  greeting: {
    initial: string;
    followUp: string;
    urgent: string;
  };
  questions: {
    symptoms: string[];
    medication: string[];
    pain: string[];
    breathing: string[];
    lifestyle: string[];
  };
  responses: {
    acknowledgment: string[];
    concern: string[];
    reassurance: string[];
    escalation: string[];
  };
  closing: {
    normal: string;
    followUpRequired: string;
    urgent: string;
  };
}

export interface VoicePersonality {
  tone: 'professional' | 'warm' | 'empathetic' | 'clinical';
  pace: 'slow' | 'normal' | 'brisk';
  formality: 'formal' | 'conversational' | 'friendly';
}

export class PromptManager {
  private conversationPrompts: ConversationPrompts = {
    greeting: {
      initial: "Hello, {patientName}. This is your CardioCare health assistant. I'm calling to check on your well-being after your recent visit. How are you feeling today?",
      followUp: "Thank you for speaking with me again, {patientName}. I'd like to continue our health check. How have things been since we last spoke?",
      urgent: "Hello {patientName}, this is CardioCare calling with an urgent follow-up. We need to check on some concerning symptoms. How are you feeling right now?"
    },
    questions: {
      symptoms: [
        "Can you describe any symptoms you've been experiencing?",
        "Have you noticed any changes in how you're feeling lately?",
        "Are there any new or worsening symptoms I should know about?",
        "How would you rate your overall comfort level today?"
      ],
      medication: [
        "Are you taking your medications as prescribed?",
        "Have you missed any doses of your medication recently?",
        "Are you experiencing any side effects from your current medications?",
        "Do you have any questions about your medication routine?"
      ],
      pain: [
        "On a scale of 1 to 10, how would you rate any pain you're experiencing?",
        "Can you describe the location and type of any pain?",
        "Has your pain level changed since your last visit?",
        "What activities make your pain better or worse?"
      ],
      breathing: [
        "How is your breathing today?",
        "Do you experience shortness of breath during normal activities?",
        "Have you had any difficulty breathing while lying down?",
        "Do you need to use extra pillows to sleep comfortably?"
      ],
      lifestyle: [
        "How has your energy level been?",
        "Are you able to perform your daily activities normally?",
        "How is your appetite and sleep quality?",
        "Have you been able to stay active as recommended?"
      ]
    },
    responses: {
      acknowledgment: [
        "I understand, thank you for sharing that.",
        "That's helpful information, {patientName}.",
        "I appreciate you being so detailed about your symptoms.",
        "Thank you for letting me know about that."
      ],
      concern: [
        "That does sound concerning. Let me ask a few more questions.",
        "I want to make sure we address this properly.",
        "Those symptoms are important to monitor closely.",
        "I'm glad you brought this to my attention."
      ],
      reassurance: [
        "That sounds like you're managing well.",
        "Those are positive signs of recovery.",
        "It's good to hear you're feeling better.",
        "You're doing a great job following your care plan."
      ],
      escalation: [
        "Based on what you've told me, I'm going to connect you with a healthcare provider immediately.",
        "These symptoms require urgent medical attention. A provider will contact you shortly.",
        "I'm concerned about what you've described. Please stay by your phone for an important call.",
        "This needs immediate medical review. Help is on the way."
      ]
    },
    closing: {
      normal: "Thank you for taking the time to speak with me today, {patientName}. Continue following your care plan, and don't hesitate to contact us if you have any concerns. Take care.",
      followUpRequired: "Thank you for the update, {patientName}. A member of your care team will follow up with you within 24 hours to discuss your progress. Please keep taking your medications as prescribed.",
      urgent: "Thank you for speaking with me, {patientName}. A healthcare provider will contact you immediately. If your symptoms worsen, please call emergency services. Stay by your phone."
    }
  };

  generatePersonalizedGreeting(
    patientName: string, 
    callType: 'initial' | 'followUp' | 'urgent',
    personality: VoicePersonality
  ): string {
    const baseGreeting = this.conversationPrompts.greeting[callType];
    let personalizedGreeting = baseGreeting.replace('{patientName}', patientName);
    
    // Adjust tone based on personality
    switch (personality.tone) {
      case 'warm':
        personalizedGreeting = this.addWarmth(personalizedGreeting);
        break;
      case 'empathetic':
        personalizedGreeting = this.addEmpathy(personalizedGreeting);
        break;
      case 'clinical':
        personalizedGreeting = this.makeClinical(personalizedGreeting);
        break;
    }
    
    return personalizedGreeting;
  }

  getRandomQuestion(category: keyof ConversationPrompts['questions']): string {
    const questions = this.conversationPrompts.questions[category];
    return questions[Math.floor(Math.random() * questions.length)];
  }

  generateResponse(
    responseType: keyof ConversationPrompts['responses'],
    patientName: string,
    context?: string
  ): string {
    const responses = this.conversationPrompts.responses[responseType];
    let response = responses[Math.floor(Math.random() * responses.length)];
    return response.replace('{patientName}', patientName);
  }

  generateClosing(
    closingType: keyof ConversationPrompts['closing'],
    patientName: string
  ): string {
    const closing = this.conversationPrompts.closing[closingType];
    return closing.replace('{patientName}', patientName);
  }

  private addWarmth(text: string): string {
    return text.replace(/Hello,/, 'Hello there,')
               .replace(/How are you/, 'How are you doing')
               .replace(/today\?/, 'today? I hope you\'re having a good day.');
  }

  private addEmpathy(text: string): string {
    return text.replace(/I'm calling/, 'I\'m reaching out')
               .replace(/check on/, 'see how you\'re doing and check on')
               .replace(/How are you feeling/, 'I want to know how you\'re feeling');
  }

  private makeClinical(text: string): string {
    return text.replace(/Hello,/, 'Good day,')
               .replace(/well-being/, 'health status')
               .replace(/How are you feeling/, 'Please report your current condition');
  }

  // Advanced prompt engineering for specific medical scenarios
  generateSymptomInquiry(symptoms: string[], patientHistory: string): string {
    const basePrompt = `Given the patient's history of ${patientHistory}, I need to ask about specific symptoms. `;
    
    if (symptoms.includes('chest pain') || symptoms.includes('cardiac')) {
      return basePrompt + this.getRandomQuestion('pain') + " Additionally, have you experienced any chest discomfort, pressure, or pain?";
    }
    
    if (symptoms.includes('breathing') || symptoms.includes('shortness of breath')) {
      return basePrompt + this.getRandomQuestion('breathing');
    }
    
    return basePrompt + this.getRandomQuestion('symptoms');
  }

  // Create conversation flow based on patient responses
  generateFollowUpPrompt(
    patientResponse: string,
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical',
    patientName: string
  ): string {
    if (urgencyLevel === 'critical') {
      return this.generateResponse('escalation', patientName);
    }
    
    if (urgencyLevel === 'high') {
      return this.generateResponse('concern', patientName) + " " + this.getRandomQuestion('symptoms');
    }
    
    if (patientResponse.toLowerCase().includes('better') || patientResponse.toLowerCase().includes('good')) {
      return this.generateResponse('reassurance', patientName) + " " + this.getRandomQuestion('lifestyle');
    }
    
    return this.generateResponse('acknowledgment', patientName) + " " + this.getRandomQuestion('symptoms');
  }

  // Update prompts for different medical specialties
  updatePromptsForSpecialty(specialty: 'cardiology' | 'general' | 'pulmonary'): void {
    switch (specialty) {
      case 'cardiology':
        this.conversationPrompts.questions.symptoms.push(
          "Have you experienced any chest pain or pressure?",
          "Do you feel your heart racing or skipping beats?",
          "Have you had any swelling in your legs or ankles?"
        );
        break;
      case 'pulmonary':
        this.conversationPrompts.questions.breathing.push(
          "Do you have a persistent cough?",
          "Are you coughing up any blood or unusual phlegm?",
          "Do you wheeze when breathing?"
        );
        break;
    }
  }
}

export const promptManager = new PromptManager();