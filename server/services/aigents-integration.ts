import type { Express } from "express";
import type { IStorage } from "../storage.js";
import multer from "multer";

/**
 * AIGENTS Platform Integration Package
 * Drop this into any Replit app to add AIGENTS automation capabilities
 */

// ===== BACKEND INTEGRATION =====

// Express.js routes to add to your server
const setupAIGENTSRoutes = (app: Express, storage: IStorage) => {
  const upload = multer();

  // Webhook endpoint for receiving AIGENTS responses
  app.post('/webhook/agents', async (req, res) => {
    const requestId = Date.now();
    console.log(`[AIGENTS-WEBHOOK-${requestId}] Received webhook from AIGENTS system`);
    console.log(`[AIGENTS-WEBHOOK-${requestId}] Payload:`, JSON.stringify(req.body, null, 2));

    try {
      const payload = req.body;
      const chainRunId = payload["Chain Run ID"] || payload.chainRunId;
      const agentResponse = payload.agentResponse || payload.summ || 
                           payload["Pre Pre Chart V2"] || "Response received";
      const agentName = payload.agentName || "AIGENTS System";

      if (!chainRunId) {
        return res.status(400).json({ error: "Chain Run ID is required" });
      }

      // Update your database with the response
      if (storage && storage.updateAutomationLogWithAgentResponse) {
        await storage.updateAutomationLogWithAgentResponse(
          chainRunId, 
          agentResponse, 
          agentName, 
          payload
        );
      }

      // Success response for AIGENTS system
      const successResponse = {
        message: "Agent response processed successfully",
        chainRunId: chainRunId,
        status: "success",
        timestamp: new Date().toISOString(),
        receivedFields: Object.keys(payload)
      };

      // Add all received fields to response for AIGENTS system
      Object.keys(payload).forEach((fieldName) => {
        const cleanFieldName = fieldName.replace(/\s+/g, '_').toLowerCase();
        successResponse[cleanFieldName] = payload[fieldName];
      });

      console.log(`[AIGENTS-WEBHOOK-${requestId}] Responding with success`);
      res.json(successResponse);

    } catch (error) {
      console.error(`[AIGENTS-WEBHOOK-${requestId}] Error:`, error);
      res.status(500).json({ 
        error: "Failed to process agent response",
        chainRunId: req.body["Chain Run ID"] || req.body.chainRunId
      });
    }
  });

  // Automation logs endpoints
  app.post('/api/automation-logs', async (req, res) => {
    try {
      if (storage && storage.createAutomationLog) {
        const log = await storage.createAutomationLog(req.body);
        res.json(log);
      } else {
        res.json({ message: "Log stored successfully" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to create log" });
    }
  });

  app.get('/api/automation-logs', async (req, res) => {
    try {
      if (storage && storage.getAutomationLogs) {
        const logs = await storage.getAutomationLogs();
        res.json(logs);
      } else {
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  console.log('[AIGENTS] Webhook routes configured at /webhook/agents');
};

// ===== FRONTEND INTEGRATION =====

// Automation trigger function
const triggerAIGENTSAutomation = async (params) => {
  const {
    email = "jeffrey.Bander@providerloop.com",
    chainToRun,
    sourceId,
    firstStepInput,
    startingVariables = {}
  } = params;

  const requestBody = {
    run_email: email,
    chain_to_run: chainToRun,
    human_readable_record: "CardioCare AI System",
    ...(sourceId && { source_id: sourceId }),
    ...(firstStepInput && { first_step_user_input: firstStepInput }),
    starting_variables: startingVariables
  };

  try {
    const response = await fetch("https://start-chain-run-943506065004.us-central1.run.app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const result = await response.text();
    
    // Extract Chain Run ID from response
    let chainRunId = '';
    try {
      const chainRunMatch = result.match(/"ChainRun_ID"\s*:\s*"([^"]+)"/);
      if (chainRunMatch) {
        chainRunId = chainRunMatch[1];
      }
    } catch (e) {
      console.log('[AIGENTS] Could not extract ChainRun_ID from response');
    }

    return {
      success: response.ok,
      chainRunId,
      response: result,
      status: response.ok ? 'success' : 'error'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
};

// Generate Source ID from patient data
const generateSourceId = (firstName, lastName, dob) => {
  if (!firstName || !lastName || !dob) return '';
  
  const formattedFirstName = firstName.trim().replace(/\s+/g, '_');
  const formattedLastName = lastName.trim().replace(/\s+/g, '_');
  
  // Convert YYYY-MM-DD to MM_DD_YYYY
  const dobFormatted = dob.split('-').length === 3 
    ? `${dob.split('-')[1]}_${dob.split('-')[2]}_${dob.split('-')[0]}`
    : dob.replace(/\//g, '_');
  
  return `${formattedLastName}_${formattedFirstName}__${dobFormatted}`;
};

// Integration with CardioCare patient system
const triggerAutomationForPatient = async (patient, chainToRun, firstStepInput, additionalVariables = {}) => {
  const sourceId = generateSourceId(patient.firstName, patient.lastName, patient.dateOfBirth);
  
  const startingVariables = {
    patient_id: patient.id,
    patient_name: `${patient.firstName} ${patient.lastName}`,
    mrn: patient.mrn,
    phone_number: patient.phoneNumber,
    condition: patient.condition,
    risk_level: patient.riskLevel,
    ...additionalVariables
  };

  console.log(`[AIGENTS] Triggering automation for patient ${patient.firstName} ${patient.lastName}`);
  console.log(`[AIGENTS] Chain: ${chainToRun}, Source ID: ${sourceId}`);

  return await triggerAIGENTSAutomation({
    chainToRun,
    sourceId,
    firstStepInput,
    startingVariables
  });
};

export {
  setupAIGENTSRoutes,
  triggerAIGENTSAutomation,
  generateSourceId,
  triggerAutomationForPatient
};