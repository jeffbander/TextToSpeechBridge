import { Express, Request, Response } from "express";
import multer from "multer";
import { CsvImportService } from "./services/csv-import";
import { storage } from "./storage";
import { callScheduler } from "./services/call-scheduler";
import { z } from "zod";

// Set up multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const csvImportService = new CsvImportService(storage as any);

export function registerCsvImportRoutes(app: Express) {
  
  // Upload and import CSV file
  app.post("/api/csv/import", upload.single('csvFile'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file provided" });
      }

      const { campaignName } = req.body;
      if (!campaignName) {
        return res.status(400).json({ error: "Campaign name is required" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const result = await csvImportService.importPatientsFromCsv(csvContent, campaignName);

      res.json(result);
    } catch (error) {
      console.error('CSV import error:', error);
      res.status(500).json({ 
        error: "Failed to import CSV", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get all call campaigns
  app.get("/api/campaigns", async (req: Request, res: Response) => {
    try {
      const campaigns = await storage.getCallCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  // Get campaign details with call attempts
  app.get("/api/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      const campaign = await storage.getCallCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const attempts = await storage.getCallAttemptsByCampaign(campaignId);
      
      res.json({
        campaign,
        attempts
      });
    } catch (error) {
      console.error('Error fetching campaign details:', error);
      res.status(500).json({ error: "Failed to fetch campaign details" });
    }
  });

  // Start campaign calling
  app.post("/api/campaigns/:id/start", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      const campaign = await storage.getCallCampaign(campaignId);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      // Update campaign status to active
      await storage.updateCallCampaign(campaignId, { status: 'active' });

      // Get pending call attempts and schedule them
      const pendingAttempts = await storage.getCallAttemptsByCampaign(campaignId);
      
      // Schedule immediate calls for pending attempts
      for (const attempt of pendingAttempts.filter(a => a.status === 'pending')) {
        await storage.updateCallAttempt(attempt.id, {
          status: 'scheduled_retry',
          scheduledAt: new Date()
        });
      }

      res.json({ 
        success: true, 
        message: `Campaign started with ${pendingAttempts.length} calls scheduled` 
      });
    } catch (error) {
      console.error('Error starting campaign:', error);
      res.status(500).json({ error: "Failed to start campaign" });
    }
  });

  // Pause campaign
  app.post("/api/campaigns/:id/pause", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      await storage.updateCallCampaign(campaignId, { status: 'paused' });
      
      res.json({ success: true, message: "Campaign paused" });
    } catch (error) {
      console.error('Error pausing campaign:', error);
      res.status(500).json({ error: "Failed to pause campaign" });
    }
  });

  // Get call attempt statistics
  app.get("/api/campaigns/:id/stats", async (req: Request, res: Response) => {
    try {
      const campaignId = parseInt(req.params.id);
      const attempts = await storage.getCallAttemptsByCampaign(campaignId);
      
      const stats = {
        total: attempts.length,
        pending: attempts.filter(a => a.status === 'pending').length,
        in_progress: attempts.filter(a => a.status === 'in_progress').length,
        completed: attempts.filter(a => a.status === 'completed').length,
        failed: attempts.filter(a => a.status === 'failed').length,
        scheduled_retry: attempts.filter(a => a.status === 'scheduled_retry').length,
      };

      res.json(stats);
    } catch (error) {
      console.error('Error fetching campaign stats:', error);
      res.status(500).json({ error: "Failed to fetch campaign statistics" });
    }
  });
}