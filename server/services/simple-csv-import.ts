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

      // Parse header
      const header = this.parseCSVLine(lines[0]);
      console.log('CSV Headers:', header);

      // Find column indices
      const systemIdIndex = header.indexOf('System ID');
      const mrnIndex = header.indexOf('MRN');
      const dobIndex = header.indexOf('DOB');
      const nameIndex = header.indexOf('Patient Name');
      const genderIndex = header.indexOf('Gender');
      const phoneIndex = header.indexOf('Phone_Number');
      const altPhoneIndex = header.indexOf('Alternate_Phone_Number');
      const addressIndex = header.indexOf('Patient_Address');
      const emailIndex = header.indexOf('Primary Email (MISSING EMAIL)');
      const masterNoteIndex = header.indexOf('Master Note (n/a)');

      if (systemIdIndex === -1 || mrnIndex === -1 || nameIndex === -1 || phoneIndex === -1) {
        return {
          success: false,
          imported: 0,
          errors: ['Required columns missing: System ID, MRN, Patient Name, or Phone_Number']
        };
      }

      // Create call campaign first
      const campaign = await this.storage.createCallCampaign({
        name: campaignName,
        description: `Imported from CSV with patient data`,
        totalPatients: 0,
        maxRetries: 3,
        retryIntervalHours: 1,
      });

      // Process data rows (skip header)
      for (let i = 1; i < lines.length; i++) {
        try {
          const line = lines[i].trim();
          if (!line) continue;

          // Simple CSV parsing - just get the basic fields we need
          const fields = this.parseCSVLine(line);
          
          // Extract required fields
          const systemId = fields[systemIdIndex]?.trim();
          const mrn = fields[mrnIndex]?.trim();
          const patientName = fields[nameIndex]?.trim();
          const phoneNumber = fields[phoneIndex]?.trim();

          if (!systemId || !mrn || !patientName || !phoneNumber) {
            errors.push(`Row ${i + 1}: Missing required data`);
            continue;
          }

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

          // Create patient record
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
            customPrompt: fields[masterNoteIndex]?.trim() ? `Patient notes: ${fields[masterNoteIndex].trim()}` : null,
            importedFrom: 'CSV Import',
          };

          const createdPatient = await this.storage.createPatient(patient);

          // Create call attempt
          await this.storage.createCallAttempt({
            campaignId: campaign.id,
            patientId: createdPatient.id,
            attemptNumber: 1,
            status: 'pending',
            phoneNumberUsed: createdPatient.phoneNumber,
            scheduledAt: new Date(),
          });

          imported++;

        } catch (error) {
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Processing error'}`);
        }
      }

      // Update campaign stats
      await this.storage.updateCallCampaign(campaign.id, {
        totalPatients: imported,
      });

      return {
        success: imported > 0,
        imported,
        errors,
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