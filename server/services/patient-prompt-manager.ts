import { Patient } from "@shared/schema";

export interface PatientSpecificPrompt {
  systemPrompt: string;
  initialGreeting: string;
  followUpQuestions: string[];
  concernFlags: string[];
  escalationTriggers: string[];
  closingInstructions: string;
}

export interface PatientContext {
  patient: Patient;
  recentVisitReason?: string;
  currentMedications?: string[];
  knownConditions?: string[];
  riskFactors?: string[];
  lastCallSummary?: string;
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export class PatientPromptManager {
  
  generatePatientSpecificPrompt(context: PatientContext): PatientSpecificPrompt {
    const { patient } = context;
    
    const systemPrompt = this.buildSystemPrompt(context);
    const initialGreeting = this.buildInitialGreeting(context);
    const followUpQuestions = this.buildFollowUpQuestions(context);
    const concernFlags = this.buildConcernFlags(context);
    const escalationTriggers = this.buildEscalationTriggers(context);
    const closingInstructions = this.buildClosingInstructions(context);

    return {
      systemPrompt,
      initialGreeting,
      followUpQuestions,
      concernFlags,
      escalationTriggers,
      closingInstructions
    };
  }

  private buildSystemPrompt(context: PatientContext): string {
    const { patient, recentVisitReason, currentMedications, knownConditions, urgencyLevel } = context;
    const patientName = `${patient.firstName} ${patient.lastName}`;
    
    return `You are a healthcare AI assistant conducting a follow-up call for ${patientName}.

PATIENT INFORMATION:
- Name: ${patientName}
- Phone: ${patient.phoneNumber}
- Primary Condition: ${patient.condition}
- Recent Visit Reason: ${recentVisitReason || 'General follow-up'}
- Current Medications: ${Array.isArray(currentMedications) ? currentMedications.join(', ') : currentMedications || 'None listed'}
- Known Conditions: ${knownConditions?.join(', ') || patient.condition}
- Urgency Level: ${urgencyLevel || 'medium'}

CONVERSATION GUIDELINES:
1. Speak naturally and warmly, like a caring healthcare professional
2. Ask one question at a time and wait for responses
3. Listen actively and ask follow-up questions based on patient responses
4. Focus on symptoms, medication adherence, and quality of life
5. Identify any concerning symptoms that need immediate attention
6. Be empathetic and professional throughout the conversation
7. Keep responses concise but thorough
8. End with clear next steps and reassurance

ESCALATION CRITERIA:
- Severe pain (8+ on pain scale)
- Difficulty breathing or chest pain
- Severe dizziness or fainting
- Medication side effects or missed doses
- Any symptom the patient describes as "worse" or "concerning"

RESPONSE FORMAT:
- Speak as if you're having a natural phone conversation
- Use the patient's name occasionally but not excessively
- Ask open-ended questions to encourage detailed responses
- Provide appropriate medical guidance within scope
- Always end with clear next steps`;
  }

  private buildInitialGreeting(context: PatientContext): string {
    const { patient, recentVisitReason, urgencyLevel } = context;
    const patientName = `${patient.firstName} ${patient.lastName}`;
    
    if (urgencyLevel === 'critical' || urgencyLevel === 'high') {
      return `Hello ${patientName}, this is your healthcare team calling. We need to check on you urgently regarding your recent ${recentVisitReason || 'visit'}. How are you feeling right now?`;
    }
    
    if (recentVisitReason) {
      return `Hello ${patientName}, this is your healthcare assistant calling for your follow-up after your recent ${recentVisitReason}. How have you been feeling since your visit?`;
    }
    
    return `Hello ${patientName}, this is your healthcare team calling to check on your well-being. How are you feeling today?`;
  }

  private buildFollowUpQuestions(context: PatientContext): string[] {
    const { patient, currentMedications, knownConditions } = context;
    
    const baseQuestions = [
      "Can you tell me about any symptoms you've been experiencing?",
      "How would you rate your overall comfort level on a scale of 1 to 10?",
      "Have you noticed any changes in your condition since your last visit?"
    ];

    const conditionSpecificQuestions = this.getConditionSpecificQuestions(patient.condition);
    const medicationQuestions = currentMedications?.length 
      ? ["Are you taking all your medications as prescribed?", "Have you experienced any side effects from your medications?"]
      : [];

    return [...baseQuestions, ...conditionSpecificQuestions, ...medicationQuestions];
  }

  private getConditionSpecificQuestions(condition: string): string[] {
    const lowerCondition = condition.toLowerCase();
    
    if (lowerCondition.includes('cardiac') || lowerCondition.includes('heart')) {
      return [
        "Have you experienced any chest pain or pressure?",
        "How has your energy level been lately?",
        "Any shortness of breath or difficulty with physical activity?"
      ];
    }
    
    if (lowerCondition.includes('diabetes')) {
      return [
        "How have your blood sugar levels been?",
        "Are you following your dietary recommendations?",
        "Any issues with your feet or vision?"
      ];
    }
    
    if (lowerCondition.includes('hypertension') || lowerCondition.includes('blood pressure')) {
      return [
        "Have you been monitoring your blood pressure?",
        "Any headaches or dizziness?",
        "How has your stress level been?"
      ];
    }
    
    return [
      "How has your specific condition been affecting you?",
      "Any new symptoms related to your condition?"
    ];
  }

  private buildConcernFlags(context: PatientContext): string[] {
    return [
      "severe pain",
      "chest pain",
      "difficulty breathing",
      "severe dizziness",
      "fainting",
      "can't take medication",
      "side effects",
      "getting worse",
      "emergency",
      "hospital",
      "can't function"
    ];
  }

  private buildEscalationTriggers(context: PatientContext): string[] {
    return [
      "Pain scale 8 or higher",
      "Chest pain or pressure",
      "Severe breathing difficulty",
      "Fainting or near-fainting",
      "Inability to take prescribed medications",
      "Severe medication side effects",
      "Patient requests immediate medical attention",
      "Symptoms described as 'much worse' or 'alarming'"
    ];
  }

  private buildClosingInstructions(context: PatientContext): string {
    const { urgencyLevel } = context;
    
    if (urgencyLevel === 'critical' || urgencyLevel === 'high') {
      return "Based on what you've shared, I'm going to have a healthcare provider contact you immediately. Please stay near your phone and don't hesitate to call 911 if your symptoms worsen.";
    }
    
    return "Thank you for taking the time to speak with me today. Based on our conversation, I'll make sure your healthcare team is updated on your progress. Continue taking your medications as prescribed, and don't hesitate to contact us if you have any concerns. Take care!";
  }

  createTwilioSystemPrompt(context: PatientContext): string {
    const prompt = this.generatePatientSpecificPrompt(context);
    
    return `${prompt.systemPrompt}

INITIAL GREETING: "${prompt.initialGreeting}"

START THE CONVERSATION: Begin with the initial greeting and then naturally guide the conversation based on the patient's responses. Remember to be warm, professional, and focused on their health and well-being.`;
  }
}

export const patientPromptManager = new PatientPromptManager();