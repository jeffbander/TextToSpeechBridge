import { parse } from 'csv-parse';
import { z } from 'zod';
import { DatabaseStorage } from '../storage';
import { InsertPatient, InsertCallCampaign, InsertCallAttempt } from '@shared/schema';

// CSV row validation schema - more flexible for real-world data
const csvRowSchema = z.object({
  'System ID': z.string().min(1),
  'MRN': z.string().min(1),
  'DOB': z.string().min(1),
  'Patient Name': z.string().min(1),
  'Gender': z.string().optional().default('Unknown'),
  'Phone_Number': z.string().min(1),
  'Alternate_Phone_Number': z.string().optional().default(''),
  'Patient_Address': z.string().optional().default(''),
  'Primary Email (MISSING EMAIL)': z.string().optional().default(''),
  'Patient_Additional_Emails': z.string().optional().default(''),
  'Master Note (n/a)': z.string().optional().default(''),
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
      // Clean CSV content - remove BOM and normalize line endings
      let cleanContent = csvContent.replace(/^\uFEFF/, ''); // Remove BOM
      cleanContent = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); // Normalize line endings
      
      // Parse CSV content
      const records = await this.parseCsv(cleanContent);
      
      // Process each row
      for (let i = 0; i < records.length; i++) {
        try {
          const rawRow = records[i];
          console.log(`Processing row ${i + 2}:`, Object.keys(rawRow));
          
          // Validate required fields manually for better error messages
          if (!rawRow['System ID'] || !rawRow['MRN'] || !rawRow['Patient Name'] || !rawRow['Phone_Number']) {
            errors.push(`Row ${i + 2}: Missing required fields (System ID, MRN, Patient Name, or Phone Number)`);
            continue;
          }
          
          const row = csvRowSchema.parse(rawRow);
          const patient = this.mapCsvRowToPatient(row);
          patients.push(patient);
        } catch (error) {
          console.error(`Row ${i + 2} error:`, error);
          if (error instanceof z.ZodError) {
            const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
            errors.push(`Row ${i + 2}: ${fieldErrors}`);
          } else {
            errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Invalid data'}`);
          }
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
      
      // Pre-process the CSV to handle multiline Master Note fields
      const processedContent = this.preprocessCsvContent(csvContent);
      
      parse(processedContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        quote: '"',
        escape: '"',
        relax_quotes: true,
        relax_column_count: true,
        skip_records_with_error: true,
      })
        .on('data', (data) => {
          // Only process records that have the required fields
          if (data['System ID'] && data['MRN'] && data['Patient Name']) {
            records.push(data);
          }
        })
        .on('error', (err) => {
          console.error('CSV parsing error:', err);
          reject(err);
        })
        .on('end', () => {
          console.log(`CSV parsing completed, found ${records.length} valid records`);
          resolve(records);
        });
    });
  }

  private preprocessCsvContent(csvContent: string): string {
    const lines = csvContent.split('\n');
    const processedLines: string[] = [];
    let currentRow = '';
    let inQuotes = false;
    let quoteCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Count quotes in the line
      quoteCount += (line.match(/"/g) || []).length;
      
      // Check if we're starting or ending a quoted field
      if (currentRow === '') {
        // Starting a new row
        currentRow = line;
        inQuotes = quoteCount % 2 !== 0;
      } else {
        // Continuing a multi-line field
        currentRow += ' ' + line.trim(); // Join with space to preserve readability
        inQuotes = quoteCount % 2 !== 0;
      }
      
      // If quotes are balanced, we have a complete row
      if (!inQuotes && currentRow.trim() !== '') {
        processedLines.push(currentRow);
        currentRow = '';
        quoteCount = 0;
      }
    }
    
    // Add any remaining row
    if (currentRow.trim() !== '') {
      processedLines.push(currentRow);
    }
    
    return processedLines.join('\n');
  }

  private mapCsvRowToPatient(row: z.infer<typeof csvRowSchema>): InsertPatient {
    // Parse patient name more robustly
    const patientName = row['Patient Name'] || '';
    let firstName = 'Unknown';
    let lastName = 'Unknown';
    
    if (patientName.includes(', ')) {
      const [last, first] = patientName.split(', ');
      lastName = last?.trim() || 'Unknown';
      firstName = first?.trim() || 'Unknown';
    } else {
      // Handle cases where name format is different
      const nameParts = patientName.trim().split(' ');
      if (nameParts.length >= 2) {
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(' ');
      } else {
        firstName = nameParts[0] || 'Unknown';
      }
    }
    
    // Extract custom prompt from Master Note
    const masterNote = row['Master Note (n/a)'] || '';
    const customPrompt = masterNote.trim() 
      ? `Patient-specific information: ${masterNote.trim()}`
      : null;

    // Clean phone numbers
    const phoneNumber = this.cleanPhoneNumber(row['Phone_Number']);
    const alternatePhone = row['Alternate_Phone_Number']?.trim();
    const alternatePhoneNumber = alternatePhone ? this.cleanPhoneNumber(alternatePhone) : null;

    return {
      systemId: row['System ID'],
      mrn: row['MRN'],
      firstName,
      lastName,
      dateOfBirth: row['DOB'],
      gender: row['Gender'] || 'Unknown',
      phoneNumber,
      alternatePhoneNumber,
      address: row['Patient_Address'] || 'Address not provided',
      email: row['Primary Email (MISSING EMAIL)']?.trim() || null,
      condition: 'General Follow-up',
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