/**
 * AIGENTS Platform Integration Package
 * Drop this into any Replit app to add AIGENTS automation capabilities
 */

// ===== BACKEND INTEGRATION =====

// Express.js routes to add to your server
const setupAIGENTSRoutes = (app, storage) => {
  const multer = require('multer');
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

  console.log('AIGENTS webhook routes configured at /webhook/agents');
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
    human_readable_record: "external app",
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
      console.log('Could not extract ChainRun_ID from response');
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

// ===== SIMPLE HTML FORM EXAMPLE =====
const createSimpleAIGENTSForm = () => {
  return `
    <div style="max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2>AIGENTS Automation Trigger</h2>
      <form id="aigents-form">
        <div style="margin-bottom: 15px;">
          <label>First Name:</label>
          <input type="text" id="firstName" style="width: 100%; padding: 8px; margin-top: 5px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label>Last Name:</label>
          <input type="text" id="lastName" style="width: 100%; padding: 8px; margin-top: 5px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label>Date of Birth:</label>
          <input type="date" id="dob" style="width: 100%; padding: 8px; margin-top: 5px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label>Chain to Run:</label>
          <select id="chainToRun" style="width: 100%; padding: 8px; margin-top: 5px;">
            <option value="Pre Pre chart">Pre Pre Chart</option>
            <option value="ATTACHMENT PROCESSING (LABS)">Attachment Processing (Labs)</option>
            <option value="ATTACHMENT PROCESSING (SLEEP STUDY)">Attachment Processing (Sleep Study)</option>
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label>First Step Input:</label>
          <textarea id="firstStepInput" style="width: 100%; padding: 8px; margin-top: 5px; height: 100px;"></textarea>
        </div>
        
        <button type="submit" style="background: #007cba; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer;">
          Trigger Automation
        </button>
      </form>
      
      <div id="result" style="margin-top: 20px; padding: 10px; border-radius: 4px; display: none;"></div>
    </div>

    <script>
      document.getElementById('aigents-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const firstName = document.getElementById('firstName').value;
        const lastName = document.getElementById('lastName').value;
        const dob = document.getElementById('dob').value;
        const chainToRun = document.getElementById('chainToRun').value;
        const firstStepInput = document.getElementById('firstStepInput').value;
        
        // Auto-generate source ID
        const sourceId = firstName && lastName && dob ? 
          \`\${lastName.replace(/\\s+/g, '_')}_\${firstName.replace(/\\s+/g, '_')}__\${dob.split('-')[1]}_\${dob.split('-')[2]}_\${dob.split('-')[0]}\` : '';
        
        const result = await triggerAIGENTSAutomation({
          chainToRun,
          sourceId,
          firstStepInput
        });
        
        const resultDiv = document.getElementById('result');
        resultDiv.style.display = 'block';
        
        if (result.success) {
          resultDiv.style.background = '#d4edda';
          resultDiv.style.border = '1px solid #c3e6cb';
          resultDiv.style.color = '#155724';
          resultDiv.innerHTML = \`<strong>Success!</strong> Chain Run ID: \${result.chainRunId}\`;
        } else {
          resultDiv.style.background = '#f8d7da';
          resultDiv.style.border = '1px solid #f5c6cb';
          resultDiv.style.color = '#721c24';
          resultDiv.innerHTML = \`<strong>Error:</strong> \${result.error || 'Failed to trigger automation'}\`;
        }
      });
    </script>
  `;
};

// ===== EXPORT FOR NODE.JS =====
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setupAIGENTSRoutes,
    triggerAIGENTSAutomation,
    generateSourceId,
    createSimpleAIGENTSForm
  };
}

// ===== USAGE EXAMPLES =====

/*
// Backend Express.js setup:
const { setupAIGENTSRoutes } = require('./aigents-integration-package');
setupAIGENTSRoutes(app, storage); // storage is optional

// Frontend usage:
const result = await triggerAIGENTSAutomation({
  chainToRun: "Pre Pre chart",
  sourceId: "Smith_John__01_15_1980",
  firstStepInput: "Patient has chest pain",
  email: "your-email@domain.com" // optional, defaults to jeffrey.Bander@providerloop.com
});

console.log(result.chainRunId); // Use this to track the automation

// Generate Source ID:
const sourceId = generateSourceId("John", "Smith", "1980-01-15");
// Returns: "Smith_John__01_15_1980"

// Simple HTML form:
document.body.innerHTML = createSimpleAIGENTSForm();
*/