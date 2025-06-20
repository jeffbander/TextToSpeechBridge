import { DatabaseStorage } from '../storage';
import { InsertPatient, InsertCallCampaign, InsertCallAttempt } from '@shared/schema';

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  campaignId?: number;
}

export class SimpleCsvImportService {
  private storage: DatabaseStorage;

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
  }

  async importPatientsFromCsv(csvContent: string, campaignName: string): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let existingPatients = 0;

    try {
      // Clean and split CSV into lines
      const cleanContent = csvContent.replace(/^\uFEFF/, ''); // Remove BOM
      const lines = cleanContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        return {
          success: false,
          imported: 0,
          errors: ['CSV file appears to be empty or invalid']
        };
      }

      // Parse header - make field mapping more flexible
      const header = this.parseCSVLine(lines[0]);
      console.log('CSV Headers:', header);

      // Find column indices with flexible matching
      const findColumnIndex = (possibleNames: string[]) => {
        for (const name of possibleNames) {
          const index = header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
          if (index !== -1) return index;
        }
        return -1;
      };

      const systemIdIndex = findColumnIndex(['System ID', 'SystemID', 'System_ID']);
      const mrnIndex = findColumnIndex(['MRN', 'Medical Record Number']);
      const dobIndex = findColumnIndex(['DOB', 'Date of Birth', 'DateOfBirth']);
      const nameIndex = findColumnIndex(['Patient Name', 'Name', 'Patient_Name']);
      const genderIndex = findColumnIndex(['Gender', 'Sex']);
      const phoneIndex = findColumnIndex(['Phone_Number', 'Phone Number', 'Primary Phone']);
      const altPhoneIndex = findColumnIndex(['Alternate_Phone_Number', 'Alternate Phone', 'Secondary Phone']);
      const addressIndex = findColumnIndex(['Patient_Address', 'Address', 'Patient Address']);
      const emailIndex = findColumnIndex(['Primary Email', 'Email']);
      const masterNoteIndex = findColumnIndex(['Master Note', 'Notes', 'Custom Prompt', 'Patient Notes']);

      if (systemIdIndex === -1) {
        return {
          success: false,
          imported: 0,
          errors: ['Required column missing: System ID - this is the unique patient identifier']
        };
      }

      if (nameIndex === -1 || phoneIndex === -1) {
        return {
          success: false,
          imported: 0,
          errors: ['Required columns missing: Patient Name and Phone_Number are required']
        };
      }

      // Create call campaign first
      const campaign = await this.storage.createCallCampaign({
        name: campaignName,
        description: `Imported from CSV - Batch ID: ${Date.now()}`,
        totalPatients: 0,
        maxRetries: 3,
        retryIntervalHours: 1,
      });

      const batchId = `CSV_${campaign.id}_${Date.now()}`;

      // Process data rows (skip header)
      for (let i = 1; i < lines.length; i++) {
        try {
          const line = lines[i].trim();
          if (!line) continue;

          const fields = this.parseCSVLine(line);
          
          // Extract System ID (unique identifier)
          const systemId = fields[systemIdIndex]?.trim();
          const patientName = fields[nameIndex]?.trim();
          const phoneNumber = fields[phoneIndex]?.trim();

          if (!systemId) {
            errors.push(`Row ${i + 1}: System ID is required (unique patient identifier)`);
            continue;
          }

          if (!patientName || !phoneNumber) {
            errors.push(`Row ${i + 1}: Patient Name and Phone Number are required`);
            continue;
          }

          // Check if patient already exists by System ID
          let existingPatient = await this.storage.getPatientBySystemId(systemId);
          let patientId: number;

          if (existingPatient) {
            // Patient exists - update if needed and create call attempt
            patientId = existingPatient.id;
            existingPatients++;
            
            // Update Master Note if provided
            const masterNote = fields[masterNoteIndex]?.trim();
            if (masterNote && masterNote !== existingPatient.customPrompt) {
              await this.storage.updatePatient(existingPatient.id, {
                customPrompt: masterNote,
                importedFrom: `${existingPatient.importedFrom || 'Previous'} + ${batchId}`,
              });
            }

          } else {
            // New patient - create record
            const mrn = fields[mrnIndex]?.trim() || systemId; // Use systemId as fallback for MRN
            
            // Parse name
            let firstName = 'Unknown';
            let lastName = 'Unknown';
            
            if (patientName.includes(', ')) {
              const [last, first] = patientName.split(', ');
              lastName = last?.trim() || 'Unknown';
              firstName = first?.trim() || 'Unknown';
            } else {
              const nameParts = patientName.trim().split(' ');
              if (nameParts.length >= 2) {
                firstName = nameParts[0];
                lastName = nameParts.slice(1).join(' ');
              } else {
                firstName = nameParts[0] || 'Unknown';
              }
            }

            const patient: InsertPatient = {
              systemId,
              mrn,
              firstName,
              lastName,
              dateOfBirth: fields[dobIndex]?.trim() || '1900-01-01',
              gender: fields[genderIndex]?.trim() || 'Unknown',
              phoneNumber: this.cleanPhoneNumber(phoneNumber),
              alternatePhoneNumber: fields[altPhoneIndex]?.trim() ? this.cleanPhoneNumber(fields[altPhoneIndex]) : null,
              address: fields[addressIndex]?.trim() || 'Address not provided',
              email: fields[emailIndex]?.trim() || null,
              condition: 'General Follow-up',
              riskLevel: 'low',
              customPrompt: fields[masterNoteIndex]?.trim() || null,
              importedFrom: batchId,
            };

            const createdPatient = await this.storage.createPatient(patient);
            patientId = createdPatient.id;
            imported++;
          }

          // Create call attempt for this patient (whether new or existing)
          await this.storage.createCallAttempt({
            campaignId: campaign.id,
            patientId: patientId,
            attemptNumber: 1,
            status: 'pending',
            phoneNumberUsed: this.cleanPhoneNumber(phoneNumber),
            scheduledAt: new Date(),
            metadata: {
              batchId,
              csvRowNumber: i + 1,
              systemId,
            },
          });

        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Processing error'}`);
        }
      }

      // Update campaign stats
      const totalPatients = imported + existingPatients;
      await this.storage.updateCallCampaign(campaign.id, {
        totalPatients,
      });

      return {
        success: totalPatients > 0,
        imported: totalPatients,
        errors: errors.concat(existingPatients > 0 ? [`Found ${existingPatients} existing patients, added to campaign`] : []),
        campaignId: campaign.id,
      };

    } catch (error) {
      return {
        success: false,
        imported: 0,
        errors: [`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private cleanPhoneNumber(phone: string): string {
    if (!phone) return '';
    
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // Add +1 if it's a 10-digit US number
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
    
    // Add + if it starts with 1 and is 11 digits
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }
    
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }
}