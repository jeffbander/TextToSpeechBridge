import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  alternatePhoneNumber: text("alternate_phone_number"), // Added for CSV import
  email: text("email"),
  dateOfBirth: text("date_of_birth").notNull(),
  mrn: text("mrn").notNull(), // Medical Record Number
  gender: text("gender").notNull(),
  address: text("address").notNull(),
  systemId: text("system_id").notNull(), // Format: Last_First__MM/DD/YYYY
  condition: text("condition").notNull(), // CHF, Post-Surgery, etc.
  lastDischarge: timestamp("last_discharge"),
  riskLevel: text("risk_level").notNull().default("low"), // low, medium, high
  customPrompt: text("custom_prompt"), // Patient-specific conversation prompt from Master Note
  promptMetadata: jsonb("prompt_metadata"), // Additional prompt configuration
  importedFrom: text("imported_from"), // Track CSV import source
  createdAt: timestamp("created_at").defaultNow(),
});

export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  status: text("status").notNull(), // active, completed, failed, escalated
  callType: text("call_type").default("manual"), // manual, automated_gpt4o, scheduled
  duration: integer("duration"), // in seconds
  outcome: text("outcome"), // routine, urgent, escalated, etc.
  successRating: text("success_rating"), // successful, partially_successful, unsuccessful
  qualityScore: integer("quality_score"), // 1-10 AI assessment of conversation quality
  informationGathered: boolean("information_gathered").default(false), // Did patient provide meaningful info
  transcript: text("transcript"),
  aiAnalysis: jsonb("ai_analysis"), // GPT analysis of call
  alertLevel: text("alert_level"), // none, warning, urgent
  customPrompt: text("custom_prompt"), // Store custom prompt separately
  metadata: jsonb("metadata"), // Additional call metadata
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  twilioCallSid: text("twilio_call_sid"),
});

export const scheduledCalls = pgTable("scheduled_calls", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  scheduledTime: timestamp("scheduled_time").notNull(),
  callType: text("call_type").notNull(), // post-discharge, medication-check, routine
  completed: boolean("completed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Call campaigns for batch patient calling
export const callCampaigns = pgTable("call_campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"), // active, paused, completed
  totalPatients: integer("total_patients").default(0),
  completedCalls: integer("completed_calls").default(0),
  successfulCalls: integer("successful_calls").default(0),
  failedCalls: integer("failed_calls").default(0),
  maxRetries: integer("max_retries").default(3),
  retryIntervalHours: integer("retry_interval_hours").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Individual call attempts within campaigns
export const callAttempts = pgTable("call_attempts", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => callCampaigns.id).notNull(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  callId: integer("call_id").references(() => calls.id),
  attemptNumber: integer("attempt_number").notNull().default(1),
  status: text("status").notNull(), // pending, in_progress, completed, failed, scheduled_retry
  phoneNumberUsed: text("phone_number_used").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  failureReason: text("failure_reason"),
  nextRetryAt: timestamp("next_retry_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  callId: integer("call_id").references(() => calls.id),
  type: text("type").notNull(), // urgent, warning, medication
  message: text("message").notNull(),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Patient documents and notes for Hume AI to read during calls
export const patientDocuments = pgTable("patient_documents", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(), // Full text content to be read by Hume AI
  documentType: text("document_type").notNull(), // discharge_summary, medication_list, care_instructions, lab_results
  priority: integer("priority").default(1), // 1-5, determines reading order
  isActive: boolean("is_active").default(true), // Whether to include in calls
  metadata: jsonb("metadata"), // Additional document info
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  direction: text("direction").notNull(), // outbound, inbound
  message: text("message").notNull(),
  status: text("status").notNull(), // sent, delivered, failed, received
  twilioSid: text("twilio_sid"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").defaultNow(),
  receivedAt: timestamp("received_at"),
});

export const automationLogs = pgTable("automation_logs", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id),
  chainRunId: text("chain_run_id").notNull(),
  chainToRun: text("chain_to_run").notNull(),
  sourceId: text("source_id"),
  firstStepInput: text("first_step_input"),
  startingVariables: jsonb("starting_variables"),
  agentResponse: text("agent_response"),
  agentName: text("agent_name"),
  status: text("status").notNull().default("pending"), // pending, completed, failed
  triggerType: text("trigger_type"), // manual, automatic_post_call, scheduled
  callId: integer("call_id").references(() => calls.id),
  response: jsonb("response"),
  metadata: jsonb("metadata"),
  responsePayload: jsonb("response_payload"),
  triggeredAt: timestamp("triggered_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const insertScheduledCallSchema = createInsertSchema(scheduledCalls).omit({
  id: true,
  createdAt: true,
});

export const insertCallCampaignSchema = createInsertSchema(callCampaigns).omit({
  id: true,
  createdAt: true,
});

export const insertCallAttemptSchema = createInsertSchema(callAttempts).omit({
  id: true,
  createdAt: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  sentAt: true,
  receivedAt: true,
});

export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAutomationLogSchema = createInsertSchema(automationLogs).omit({
  id: true,
  triggeredAt: true,
  completedAt: true,
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Call = typeof calls.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type ScheduledCall = typeof scheduledCalls.$inferSelect;
export type InsertScheduledCall = z.infer<typeof insertScheduledCallSchema>;
export type CallCampaign = typeof callCampaigns.$inferSelect;
export type InsertCallCampaign = z.infer<typeof insertCallCampaignSchema>;
export type CallAttempt = typeof callAttempts.$inferSelect;
export type InsertCallAttempt = z.infer<typeof insertCallAttemptSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = z.infer<typeof insertPatientDocumentSchema>;
export type AutomationLog = typeof automationLogs.$inferSelect;
export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;
