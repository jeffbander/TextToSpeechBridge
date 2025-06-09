import type { Express } from "express";
import { storage } from "./storage";
import { patientPromptManager } from "./services/patient-prompt-manager";

interface PatientPromptRequest {
  patientId: number;
  templateId?: string;
  customConditions?: string[];
  customMedications?: string[];
  urgencyLevel?: 'low' | 'medium' | 'high' | 'critical';
  recentVisitReason?: string;
  customInstructions?: string;
}

interface GeneratedPatientPrompt {
  patientId: number;
  patientName: string;
  templateUsed?: string;
  systemPrompt: string;
  initialGreeting: string;
  followUpQuestions: string[];
  escalationTriggers: string[];
  closingInstructions: string;
  urgencyLevel: string;
  generatedAt: Date;
}

export function registerPatientPromptRoutes(app: Express) {
  console.log('[PATIENT-PROMPTS] Initializing patient-specific prompt generation routes');

  // Generate patient-specific prompt
  app.post('/api/patients/:id/generate-prompt', async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const requestData: PatientPromptRequest = req.body;

      // Get patient data
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Build patient context
      const patientContext = {
        patient,
        recentVisitReason: requestData.recentVisitReason || 'Recent discharge follow-up',
        currentMedications: requestData.customMedications || [],
        knownConditions: requestData.customConditions || [patient.condition],
        urgencyLevel: requestData.urgencyLevel || (patient.riskLevel as any) || 'medium',
        riskFactors: []
      };

      // Generate patient-specific prompt
      const patientPrompt = patientPromptManager.generatePatientSpecificPrompt(patientContext);

      const generatedPrompt: GeneratedPatientPrompt = {
        patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        templateUsed: requestData.templateId,
        systemPrompt: patientPrompt.systemPrompt,
        initialGreeting: patientPrompt.initialGreeting,
        followUpQuestions: patientPrompt.followUpQuestions,
        escalationTriggers: patientPrompt.escalationTriggers,
        closingInstructions: patientPrompt.closingInstructions,
        urgencyLevel: patientContext.urgencyLevel,
        generatedAt: new Date()
      };

      console.log(`[PATIENT-PROMPTS] Generated personalized prompt for patient: ${patient.firstName} ${patient.lastName}`);
      res.json(generatedPrompt);

    } catch (error) {
      console.error('[PATIENT-PROMPTS] Error generating patient prompt:', error);
      res.status(500).json({ error: 'Failed to generate patient prompt' });
    }
  });

  // Generate Twilio-ready system prompt for a patient
  app.post('/api/patients/:id/twilio-prompt', async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const requestData: PatientPromptRequest = req.body;

      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const patientContext = {
        patient,
        recentVisitReason: requestData.recentVisitReason || 'Recent discharge follow-up',
        currentMedications: requestData.customMedications || [],
        knownConditions: requestData.customConditions || [patient.condition],
        urgencyLevel: requestData.urgencyLevel || (patient.riskLevel as any) || 'medium',
        riskFactors: []
      };

      // Generate Twilio-specific system prompt
      const twilioSystemPrompt = patientPromptManager.createTwilioSystemPrompt(patientContext);

      console.log(`[PATIENT-PROMPTS] Generated Twilio system prompt for patient: ${patient.firstName} ${patient.lastName}`);
      res.json({
        patientId,
        patientName: `${patient.firstName} ${patient.lastName}`,
        twilioSystemPrompt,
        generatedAt: new Date()
      });

    } catch (error) {
      console.error('[PATIENT-PROMPTS] Error generating Twilio prompt:', error);
      res.status(500).json({ error: 'Failed to generate Twilio prompt' });
    }
  });

  // Test patient prompt with voice profile
  app.post('/api/patients/:id/test-prompt', async (req, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const { voiceProfileId, scenario } = req.body;

      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      const patientContext = {
        patient,
        recentVisitReason: scenario?.recentVisitReason || 'Recent discharge follow-up',
        currentMedications: [],
        knownConditions: [patient.condition],
        urgencyLevel: scenario?.urgencyLevel || 'medium',
        riskFactors: []
      };

      const patientPrompt = patientPromptManager.generatePatientSpecificPrompt(patientContext);

      // Format for testing display
      const testResult = {
        patientName: `${patient.firstName} ${patient.lastName}`,
        scenario: scenario || 'Standard follow-up',
        voiceProfile: voiceProfileId || 'default',
        systemPrompt: patientPrompt.systemPrompt,
        personalizedGreeting: patientPrompt.initialGreeting.replace('[Patient]', patient.firstName),
        followUpQuestions: patientPrompt.followUpQuestions,
        escalationTriggers: patientPrompt.escalationTriggers,
        closingInstructions: patientPrompt.closingInstructions,
        generatedAt: new Date()
      };

      console.log(`[PATIENT-PROMPTS] Generated test prompt for patient: ${patient.firstName} ${patient.lastName}`);
      res.json(testResult);

    } catch (error) {
      console.error('[PATIENT-PROMPTS] Error testing patient prompt:', error);
      res.status(500).json({ error: 'Failed to test patient prompt' });
    }
  });

  console.log('[PATIENT-PROMPTS] Patient-specific prompt generation routes registered');
}