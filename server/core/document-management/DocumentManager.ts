/**
 * Document Management Service
 * Handles patient document storage and retrieval with strict data isolation
 */

import { IDocumentManager, PatientDocument } from '../interfaces';
import { Logger } from '../../utils/logger';
import { nanoid } from 'nanoid';

export class DocumentManager implements IDocumentManager {
  private documents: Map<string, PatientDocument> = new Map();
  private patientDocumentIndex: Map<string, Set<string>> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('DocumentManager');
    this.initializeSampleData();
  }

  async addDocument(
    patientId: string, 
    document: Omit<PatientDocument, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<PatientDocument> {
    try {
      const documentId = nanoid();
      const now = new Date();
      
      const newDocument: PatientDocument = {
        id: documentId,
        patientId,
        ...document,
        createdAt: now,
        updatedAt: now,
      };

      // Store document
      this.documents.set(documentId, newDocument);
      
      // Update patient index
      if (!this.patientDocumentIndex.has(patientId)) {
        this.patientDocumentIndex.set(patientId, new Set());
      }
      this.patientDocumentIndex.get(patientId)!.add(documentId);

      this.logger.info(`Added document ${documentId} for patient ${patientId}`);
      
      return newDocument;
    } catch (error) {
      this.logger.error('Failed to add document:', error);
      throw error;
    }
  }

  async getPatientDocuments(patientId: string): Promise<PatientDocument[]> {
    try {
      const documentIds = this.patientDocumentIndex.get(patientId) || new Set();
      const documents: PatientDocument[] = [];
      
      for (const documentId of documentIds) {
        const document = this.documents.get(documentId);
        if (document && document.patientId === patientId) { // Double-check for data isolation
          documents.push(document);
        }
      }
      
      // Sort by creation date, newest first
      documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      this.logger.info(`Retrieved ${documents.length} documents for patient ${patientId}`);
      
      return documents;
    } catch (error) {
      this.logger.error('Failed to get patient documents:', error);
      throw error;
    }
  }

  async updateDocument(documentId: string, updates: Partial<PatientDocument>): Promise<PatientDocument> {
    try {
      const existingDocument = this.documents.get(documentId);
      if (!existingDocument) {
        throw new Error(`Document ${documentId} not found`);
      }

      const updatedDocument: PatientDocument = {
        ...existingDocument,
        ...updates,
        id: documentId, // Prevent ID changes
        patientId: existingDocument.patientId, // Prevent patient ID changes
        createdAt: existingDocument.createdAt, // Prevent creation date changes
        updatedAt: new Date(),
      };

      this.documents.set(documentId, updatedDocument);
      
      this.logger.info(`Updated document ${documentId}`);
      
      return updatedDocument;
    } catch (error) {
      this.logger.error('Failed to update document:', error);
      throw error;
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    try {
      const document = this.documents.get(documentId);
      if (!document) {
        throw new Error(`Document ${documentId} not found`);
      }

      const patientId = document.patientId;
      
      // Remove from documents
      this.documents.delete(documentId);
      
      // Remove from patient index
      const patientDocuments = this.patientDocumentIndex.get(patientId);
      if (patientDocuments) {
        patientDocuments.delete(documentId);
        if (patientDocuments.size === 0) {
          this.patientDocumentIndex.delete(patientId);
        }
      }

      this.logger.info(`Deleted document ${documentId} for patient ${patientId}`);
    } catch (error) {
      this.logger.error('Failed to delete document:', error);
      throw error;
    }
  }

  async searchDocuments(patientId: string, query: string): Promise<PatientDocument[]> {
    try {
      const patientDocuments = await this.getPatientDocuments(patientId);
      const lowercaseQuery = query.toLowerCase();
      
      const matchingDocuments = patientDocuments.filter(document => {
        return (
          document.title.toLowerCase().includes(lowercaseQuery) ||
          document.content.toLowerCase().includes(lowercaseQuery) ||
          document.type.toLowerCase().includes(lowercaseQuery)
        );
      });

      this.logger.info(`Found ${matchingDocuments.length} documents matching query for patient ${patientId}`);
      
      return matchingDocuments;
    } catch (error) {
      this.logger.error('Failed to search documents:', error);
      throw error;
    }
  }

  /**
   * Get document by ID with patient verification
   */
  async getDocument(documentId: string, patientId: string): Promise<PatientDocument | null> {
    try {
      const document = this.documents.get(documentId);
      
      if (!document) {
        return null;
      }

      // Verify patient ownership for data isolation
      if (document.patientId !== patientId) {
        this.logger.warn(`Access denied: Document ${documentId} does not belong to patient ${patientId}`);
        return null;
      }

      return document;
    } catch (error) {
      this.logger.error('Failed to get document:', error);
      throw error;
    }
  }

  /**
   * Get documents by type for a patient
   */
  async getDocumentsByType(patientId: string, type: PatientDocument['type']): Promise<PatientDocument[]> {
    try {
      const patientDocuments = await this.getPatientDocuments(patientId);
      
      return patientDocuments.filter(document => document.type === type);
    } catch (error) {
      this.logger.error('Failed to get documents by type:', error);
      throw error;
    }
  }

  /**
   * Get document statistics for a patient
   */
  async getDocumentStats(patientId: string): Promise<{
    total: number;
    byType: Record<PatientDocument['type'], number>;
    lastUpdated: Date | null;
  }> {
    try {
      const patientDocuments = await this.getPatientDocuments(patientId);
      
      const stats = {
        total: patientDocuments.length,
        byType: {
          'medical_record': 0,
          'discharge_instructions': 0,
          'medication_list': 0,
          'care_plan': 0,
          'notes': 0,
        } as Record<PatientDocument['type'], number>,
        lastUpdated: null as Date | null,
      };

      for (const document of patientDocuments) {
        stats.byType[document.type]++;
        
        if (!stats.lastUpdated || document.updatedAt > stats.lastUpdated) {
          stats.lastUpdated = document.updatedAt;
        }
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get document stats:', error);
      throw error;
    }
  }

  /**
   * Initialize sample data for testing
   */
  private initializeSampleData(): void {
    // Sample data for Jeff Bander (patient ID would be fetched from database)
    const samplePatientId = 'sample-patient-jeff-bander';
    
    const sampleDocuments = [
      {
        title: 'Hospital Discharge Instructions',
        content: `DISCHARGE INSTRUCTIONS FOR JEFF BANDER

Date: July 1, 2025
Condition: Congestive Heart Failure (CHF)

MEDICATIONS:
- Lisinopril 10mg daily (morning)
- Metoprolol 25mg twice daily
- Furosemide 20mg daily (morning)

ACTIVITY RESTRICTIONS:
- No lifting over 10 pounds
- Walk 15-20 minutes daily as tolerated
- Monitor daily weight

WARNING SIGNS - Call doctor immediately if:
- Weight gain over 2 pounds in one day
- Shortness of breath at rest
- Swelling in legs or ankles
- Chest pain or pressure

FOLLOW-UP:
- See cardiologist within 1 week
- Lab work in 3 days`,
        type: 'discharge_instructions' as const,
      },
      {
        title: 'Current Medications',
        content: `MEDICATION LIST - JEFF BANDER

1. LISINOPRIL 10mg
   - Take once daily in morning
   - For blood pressure and heart function
   - Do not skip doses

2. METOPROLOL 25mg
   - Take twice daily (morning and evening)
   - For heart rate control
   - Take with food

3. FUROSEMIDE (LASIX) 20mg
   - Take once daily in morning
   - Water pill - may increase urination
   - Take early to avoid nighttime bathroom trips

IMPORTANT NOTES:
- Set up pill organizer for daily doses
- Never stop medications without doctor approval
- Call pharmacy for refills 3 days early`,
        type: 'medication_list' as const,
      },
      {
        title: 'Care Plan Summary',
        content: `HEART FAILURE CARE PLAN - JEFF BANDER

DIAGNOSIS: Congestive Heart Failure (CHF)
RISK LEVEL: High

DAILY MONITORING:
- Weight check every morning
- Blood pressure monitoring
- Symptom tracking

LIFESTYLE MODIFICATIONS:
- Low sodium diet (under 2000mg daily)
- Fluid restriction (64oz daily)
- Regular gentle exercise
- Medication compliance

EMERGENCY PROTOCOL:
- Call 911 for chest pain or severe shortness of breath
- Contact cardiology for weight gain >2lbs/day
- Have medication list available at all times

NEXT APPOINTMENTS:
- Cardiology follow-up: July 8, 2025
- Primary care: July 15, 2025`,
        type: 'care_plan' as const,
      },
    ];

    // Add sample documents
    for (const docData of sampleDocuments) {
      const documentId = nanoid();
      const now = new Date();
      
      const document: PatientDocument = {
        id: documentId,
        patientId: samplePatientId,
        ...docData,
        createdAt: now,
        updatedAt: now,
      };

      this.documents.set(documentId, document);
      
      if (!this.patientDocumentIndex.has(samplePatientId)) {
        this.patientDocumentIndex.set(samplePatientId, new Set());
      }
      this.patientDocumentIndex.get(samplePatientId)!.add(documentId);
    }

    this.logger.info('Initialized sample patient documents');
  }
}