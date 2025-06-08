import type { Express } from "express";
import { patientPromptManager } from "./services/patient-prompt-manager";

interface PromptTemplate {
  id: string;
  name: string;
  condition: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  systemPrompt: string;
  initialGreeting: string;
  followUpQuestions: string[];
  escalationTriggers: string[];
}

// In-memory storage for prompt templates
let promptTemplates: PromptTemplate[] = [
  {
    id: 'cardiac-surgery',
    name: 'Cardiac Surgery Follow-up',
    condition: 'Post-cardiac surgery',
    urgencyLevel: 'medium',
    systemPrompt: 'You are a healthcare AI assistant conducting a follow-up call for a post-cardiac surgery patient.',
    initialGreeting: 'Hello [Patient], this is your healthcare assistant calling for your follow-up after your recent cardiac surgery. How have you been feeling since your visit?',
    followUpQuestions: [
      'Have you experienced any chest pain or pressure?',
      'How has your energy level been lately?',
      'Any shortness of breath or difficulty with physical activity?',
      'Are you taking all your medications as prescribed?',
      'How would you rate your overall comfort level on a scale of 1 to 10?'
    ],
    escalationTriggers: [
      'severe chest pain',
      'difficulty breathing',
      'fainting or severe dizziness'
    ]
  },
  {
    id: 'diabetes-management',
    name: 'Diabetes Management',
    condition: 'Diabetes',
    urgencyLevel: 'medium',
    systemPrompt: 'You are a healthcare AI assistant conducting a diabetes monitoring call.',
    initialGreeting: 'Hello [Patient], this is your diabetes care team checking in. How have your blood sugar levels been lately?',
    followUpQuestions: [
      'How have your blood sugar levels been?',
      'Are you following your dietary recommendations?',
      'Any issues with your feet or vision?',
      'Are you taking your diabetes medications as prescribed?'
    ],
    escalationTriggers: [
      'extremely high blood sugar',
      'vision problems',
      'foot pain or numbness'
    ]
  },
  {
    id: 'urgent-followup',
    name: 'Urgent Follow-up',
    condition: 'High-priority concerns',
    urgencyLevel: 'critical',
    systemPrompt: 'You are a healthcare AI assistant conducting an urgent follow-up call for high-priority patient concerns.',
    initialGreeting: 'Hello [Patient], this is your healthcare team calling urgently. We need to check on you immediately. How are you feeling right now?',
    followUpQuestions: [
      'Describe your current symptoms in detail',
      'When did these symptoms start?',
      'Have you taken any medications for this?'
    ],
    escalationTriggers: [
      'severe pain',
      'difficulty breathing',
      'loss of consciousness'
    ]
  }
];

export function registerPromptTemplateRoutes(app: Express) {
  console.log("[PROMPT-TEMPLATES] Initializing prompt template management routes");

  // Get all prompt templates
  app.get("/api/prompt-templates", (req, res) => {
    res.json(promptTemplates);
  });

  // Get specific prompt template
  app.get("/api/prompt-templates/:id", (req, res) => {
    const { id } = req.params;
    const template = promptTemplates.find(t => t.id === id);
    
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    
    res.json(template);
  });

  // Create new prompt template
  app.post("/api/prompt-templates", (req, res) => {
    try {
      const newTemplate: PromptTemplate = {
        id: `template-${Date.now()}`,
        ...req.body
      };
      
      promptTemplates.push(newTemplate);
      
      console.log(`[PROMPT-TEMPLATES] Created new template: ${newTemplate.name}`);
      res.status(201).json(newTemplate);
      
    } catch (error) {
      console.error('[PROMPT-TEMPLATES] Error creating template:', error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Update prompt template
  app.put("/api/prompt-templates/:id", (req, res) => {
    try {
      const { id } = req.params;
      const templateIndex = promptTemplates.findIndex(t => t.id === id);
      
      if (templateIndex === -1) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      promptTemplates[templateIndex] = { ...promptTemplates[templateIndex], ...req.body };
      
      console.log(`[PROMPT-TEMPLATES] Updated template: ${id}`);
      res.json(promptTemplates[templateIndex]);
      
    } catch (error) {
      console.error('[PROMPT-TEMPLATES] Error updating template:', error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  // Delete prompt template
  app.delete("/api/prompt-templates/:id", (req, res) => {
    try {
      const { id } = req.params;
      const templateIndex = promptTemplates.findIndex(t => t.id === id);
      
      if (templateIndex === -1) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      promptTemplates.splice(templateIndex, 1);
      
      console.log(`[PROMPT-TEMPLATES] Deleted template: ${id}`);
      res.json({ message: "Template deleted successfully" });
      
    } catch (error) {
      console.error('[PROMPT-TEMPLATES] Error deleting template:', error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Test prompt generation
  app.post("/api/prompt-templates/test", (req, res) => {
    try {
      const { templateId, patientName, condition, urgencyLevel } = req.body;
      
      const template = promptTemplates.find(t => t.id === templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Generate personalized greeting
      const personalizedGreeting = template.initialGreeting.replace('[Patient]', patientName);
      
      const result = {
        templateName: template.name,
        condition: template.condition,
        urgencyLevel: template.urgencyLevel,
        personalizedGreeting,
        followUpQuestions: template.followUpQuestions,
        escalationTriggers: template.escalationTriggers,
        systemPrompt: template.systemPrompt
      };
      
      console.log(`[PROMPT-TEMPLATES] Generated test prompt for: ${patientName}`);
      res.json(result);
      
    } catch (error) {
      console.error('[PROMPT-TEMPLATES] Error testing prompt:', error);
      res.status(500).json({ message: "Failed to test prompt" });
    }
  });

  console.log("[PROMPT-TEMPLATES] Prompt template management routes registered");
}