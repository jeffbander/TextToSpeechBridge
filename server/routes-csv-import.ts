import { Express } from "express";
import { storage } from "./storage";
import multer from "multer";
import { z } from "zod";

// Configure multer for file upload
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// CSV row validation schema
const csvRowSchema = z.object({
  systemId: z.string().min(1, "System ID is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  mrn: z.string().min(1, "MRN is required"),
  phoneNumber: z.string().min(1, "Phone number is required"),
  dateOfService: z.string().min(1, "Date of service is required"),
  timeOfService: z.string().min(1, "Time of service is required"),
  prompt: z.string().min(1, "Prompt is required"),
  priority: z.enum(["urgent", "high", "normal", "low"]).default("normal"),
  email: z.string().email().optional().or(z.literal("")),
  gender: z.string().default("Unknown"),
  address: z.string().default("Not provided"),
  condition: z.string().default("General follow-up")
});

interface CSVImportResult {
  totalRows: number;
  processedRows: number;
  newPatients: number;
  existingPatients: number;
  worklistItems: number;
  errors: Array<{ row: number; error: string }>;
}

function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    return values.map(val => val.replace(/^"|"$/g, ''));
  });
}

function formatSystemId(firstName: string, lastName: string, dateOfBirth: string): string {
  // Convert date format MM/DD/YYYY or YYYY-MM-DD to MM/DD/YYYY
  let formattedDate = dateOfBirth;
  if (dateOfBirth.includes('-')) {
    const [year, month, day] = dateOfBirth.split('-');
    formattedDate = `${month}/${day}/${year}`;
  }
  
  return `${lastName}_${firstName}__${formattedDate}`;
}

export function registerCSVImportRoutes(app: Express) {
  console.log('[CSV-IMPORT] Initializing CSV import routes');

  // Upload and process CSV file
  app.post('/api/csv/import-patients', upload.single('csvFile'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const rows = parseCSV(csvContent);
      
      if (rows.length === 0) {
        return res.status(400).json({ error: 'CSV file is empty' });
      }

      // Extract headers (first row)
      const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, ''));
      const dataRows = rows.slice(1);

      const result: CSVImportResult = {
        totalRows: dataRows.length,
        processedRows: 0,
        newPatients: 0,
        existingPatients: 0,
        worklistItems: 0,
        errors: []
      };

      // Expected header mapping
      const headerMap = {
        'systemid': 'systemId',
        'firstname': 'firstName',
        'lastname': 'lastName',
        'dateofbirth': 'dateOfBirth',
        'dob': 'dateOfBirth',
        'mrn': 'mrn',
        'phonenumber': 'phoneNumber',
        'phone': 'phoneNumber',
        'dateofservice': 'dateOfService',
        'timeofservice': 'timeOfService',
        'prompt': 'prompt',
        'priority': 'priority',
        'email': 'email',
        'gender': 'gender',
        'address': 'address',
        'condition': 'condition'
      };

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNumber = i + 2; // +2 because we skipped header and arrays are 0-indexed

        try {
          // Map row data to object
          const rowData: any = {};
          headers.forEach((header, index) => {
            const mappedKey = headerMap[header as keyof typeof headerMap];
            if (mappedKey && row[index] !== undefined) {
              rowData[mappedKey] = row[index];
            }
          });

          // Generate systemId if not provided
          if (!rowData.systemId && rowData.firstName && rowData.lastName && rowData.dateOfBirth) {
            rowData.systemId = formatSystemId(rowData.firstName, rowData.lastName, rowData.dateOfBirth);
          }

          // Validate row data
          const validatedData = csvRowSchema.parse(rowData);

          // Check if patient exists by systemId
          let patient = await storage.getPatientBySystemId(validatedData.systemId);
          
          if (!patient) {
            // Create new patient
            patient = await storage.createPatient({
              firstName: validatedData.firstName,
              lastName: validatedData.lastName,
              phoneNumber: validatedData.phoneNumber,
              email: validatedData.email || null,
              dateOfBirth: validatedData.dateOfBirth,
              mrn: validatedData.mrn,
              gender: validatedData.gender,
              address: validatedData.address,
              systemId: validatedData.systemId,
              condition: validatedData.condition,
              riskLevel: "medium", // Default risk level
              customPrompt: validatedData.prompt
            });
            result.newPatients++;
          } else {
            result.existingPatients++;
          }

          // Parse date and time for scheduling
          const serviceDateTime = new Date(`${validatedData.dateOfService} ${validatedData.timeOfService}`);
          
          // Check if worklist item already exists
          const existingWorklist = await storage.getCallWorklistBySystemId(validatedData.systemId);
          
          if (!existingWorklist) {
            // Create worklist item
            await storage.createCallWorklist({
              patientId: patient.id,
              systemId: validatedData.systemId,
              dateOfService: serviceDateTime,
              timeOfService: validatedData.timeOfService,
              customPrompt: validatedData.prompt,
              priority: validatedData.priority,
              scheduledFor: serviceDateTime,
              status: "pending"
            });
            result.worklistItems++;
          }

          result.processedRows++;

        } catch (error) {
          console.error(`Error processing row ${rowNumber}:`, error);
          result.errors.push({
            row: rowNumber,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log(`[CSV-IMPORT] Processed ${result.processedRows}/${result.totalRows} rows successfully`);
      console.log(`[CSV-IMPORT] Created ${result.newPatients} new patients, ${result.worklistItems} worklist items`);

      res.json({
        success: true,
        message: 'CSV import completed',
        result
      });

    } catch (error) {
      console.error('[CSV-IMPORT] Error processing CSV:', error);
      res.status(500).json({ 
        error: 'Failed to process CSV file',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get call worklist
  app.get('/api/csv/worklist', async (req, res) => {
    try {
      const worklist = await storage.getCallWorklist();
      const patients = await storage.getPatients();
      
      const worklistWithPatients = worklist.map(item => {
        const patient = patients.find(p => p.id === item.patientId);
        return {
          ...item,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
          patientPhone: patient?.phoneNumber || '',
          patientCondition: patient?.condition || ''
        };
      });

      res.json(worklistWithPatients);
    } catch (error) {
      console.error('[CSV-IMPORT] Error fetching worklist:', error);
      res.status(500).json({ error: 'Failed to fetch call worklist' });
    }
  });

  // Get pending worklist items
  app.get('/api/csv/worklist/pending', async (req, res) => {
    try {
      const pendingItems = await storage.getPendingCallWorklist();
      const patients = await storage.getPatients();
      
      const pendingWithPatients = pendingItems.map(item => {
        const patient = patients.find(p => p.id === item.patientId);
        return {
          ...item,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown',
          patientPhone: patient?.phoneNumber || '',
          patientCondition: patient?.condition || ''
        };
      });

      res.json(pendingWithPatients);
    } catch (error) {
      console.error('[CSV-IMPORT] Error fetching pending worklist:', error);
      res.status(500).json({ error: 'Failed to fetch pending worklist' });
    }
  });

  // Update worklist item status
  app.put('/api/csv/worklist/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, notes, callId } = req.body;

      const updates: any = {};
      if (status) updates.status = status;
      if (notes) updates.notes = notes;
      if (callId) updates.callId = callId;
      if (status === 'completed') updates.completedAt = new Date();

      const updatedItem = await storage.updateCallWorklist(id, updates);
      
      if (!updatedItem) {
        return res.status(404).json({ error: 'Worklist item not found' });
      }

      res.json({
        success: true,
        message: 'Worklist item updated',
        item: updatedItem
      });
    } catch (error) {
      console.error('[CSV-IMPORT] Error updating worklist item:', error);
      res.status(500).json({ error: 'Failed to update worklist item' });
    }
  });

  // Execute worklist item (make the call)
  app.post('/api/csv/worklist/:id/execute', async (req, res) => {
    try {
      const worklistId = parseInt(req.params.id);
      const worklist = await storage.getCallWorklist();
      const item = worklist.find(w => w.id === worklistId);
      
      if (!item) {
        return res.status(404).json({ error: 'Worklist item not found' });
      }

      const patient = await storage.getPatient(item.patientId);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Create call with worklist prompt
      const call = await storage.createCall({
        patientId: item.patientId,
        status: 'active',
        callType: 'automated_worklist',
        outcome: null,
        transcript: '',
        aiAnalysis: null,
        alertLevel: 'none',
        duration: null,
        twilioCallSid: null,
        customPrompt: item.customPrompt
      });

      // Update worklist item
      await storage.updateCallWorklist(worklistId, {
        status: 'scheduled',
        callId: call.id,
        lastAttempt: new Date(),
        attemptCount: (item.attemptCount || 0) + 1
      });

      res.json({
        success: true,
        message: 'Call initiated from worklist',
        callId: call.id,
        worklistId: worklistId
      });

    } catch (error) {
      console.error('[CSV-IMPORT] Error executing worklist item:', error);
      res.status(500).json({ error: 'Failed to execute worklist item' });
    }
  });

  console.log('[CSV-IMPORT] CSV import routes registered');
}