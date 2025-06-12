import { parse } from 'csv-parse';
import { z } from 'zod';
import { DatabaseStorage } from '../storage';
import { InsertPatient, InsertCallCampaign, InsertCallAttempt } from '@shared/schema';

// CSV row validation schema
const csvRowSchema = z.object({
  'System ID': z.string(),
  'MRN': z.string(),
  'DOB': z.string(),
  'Patient Name': z.string(),
  'Gender': z.string(),
  'Phone_Number': z.string(),
  'Alternate_Phone_Number': z.string().optional(),
  'Patient_Address': z.string(),
  'Primary Email (MISSING EMAIL)': z.string().optional(),
  'Patient_Additional_Emails': z.string().optional(),
  'Master Note (n/a)': z.string().optional(),
});

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  campaignId?: number;
}

export class CsvImportService {
  private storage: DatabaseStorage;

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
  }

  async importPatientsFromCsv(csvContent: string, campaignName: string): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let patients: InsertPatient[] = [];

    try {
      // Parse CSV content
      const records = await this.parseCsv(csvContent);
      
      // Process each row
      for (let i = 0; i < records.length; i++) {
        try {
          const row = csvRowSchema.parse(records[i]);
          const patient = this.mapCsvRowToPatient(row);
          patients.push(patient);
        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      }

      // Create call campaign
      const campaign = await this.storage.createCallCampaign({
        name: campaignName,
        description: `Imported from CSV with ${patients.length} patients`,
        totalPatients: patients.length,
        maxRetries: 3,
        retryIntervalHours: 1,
      });

      // Import patients and create call attempts
      for (const patientData of patients) {
        try {
          const patient = await this.storage.createPatient(patientData);
          
          // Create initial call attempt
          await this.storage.createCallAttempt({
            campaignId: campaign.id,
            patientId: patient.id,
            attemptNumber: 1,
            status: 'pending',
            phoneNumberUsed: patient.phoneNumber,
            scheduledAt: new Date(),
          });
          
          imported++;
        } catch (error) {
          errors.push(`Failed to import patient ${patientData.firstName} ${patientData.lastName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        errors: [`CSV parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  private parseCsv(csvContent: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const records: any[] = [];
      
      parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })
        .on('data', (data) => records.push(data))
        .on('error', (err) => reject(err))
        .on('end', () => resolve(records));
    });
  }

  private mapCsvRowToPatient(row: z.infer<typeof csvRowSchema>): InsertPatient {
    const [lastName, firstName] = row['Patient Name'].split(', ');
    
    // Extract custom prompt from Master Note
    const masterNote = row['Master Note (n/a)'] || '';
    const customPrompt = masterNote.trim() 
      ? `Patient-specific information: ${masterNote.trim()}`
      : undefined;

    return {
      systemId: row['System ID'],
      mrn: row['MRN'],
      firstName: firstName?.trim() || 'Unknown',
      lastName: lastName?.trim() || 'Unknown',
      dateOfBirth: row['DOB'],
      gender: row['Gender'],
      phoneNumber: this.cleanPhoneNumber(row['Phone_Number']),
      alternatePhoneNumber: row['Alternate_Phone_Number'] 
        ? this.cleanPhoneNumber(row['Alternate_Phone_Number']) 
        : null,
      address: row['Patient_Address'] || 'Not provided',
      email: row['Primary Email (MISSING EMAIL)'] || null,
      condition: 'General Follow-up', // Default condition
      riskLevel: 'low',
      customPrompt,
      importedFrom: 'CSV Import',
    };
  }

  private cleanPhoneNumber(phone: string): string {
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