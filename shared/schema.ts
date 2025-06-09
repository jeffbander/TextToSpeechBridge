import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  email: text("email"),
  dateOfBirth: text("date_of_birth").notNull(),
  mrn: text("mrn").notNull(), // Medical Record Number
  gender: text("gender").notNull(),
  address: text("address").notNull(),
  systemId: text("system_id").notNull(), // Format: Last_First__MM/DD/YYYY
  condition: text("condition").notNull(), // CHF, Post-Surgery, etc.
  lastDischarge: timestamp("last_discharge"),
  riskLevel: text("risk_level").notNull().default("low"), // low, medium, high
  customPrompt: text("custom_prompt"), // Patient-specific conversation prompt
  promptMetadata: jsonb("prompt_metadata"), // Additional prompt configuration
  createdAt: timestamp("created_at").defaultNow(),
});

export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  status: text("status").notNull(), // active, completed, failed, escalated
  callType: text("call_type").default("manual"), // manual, automated_gpt4o, scheduled
  duration: integer("duration"), // in seconds
  outcome: text("outcome"), // routine, urgent, escalated, etc.
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

export const callWorklist = pgTable("call_worklist", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id).notNull(),
  systemId: text("system_id").notNull(), // External system reference
  dateOfService: timestamp("date_of_service").notNull(),
  timeOfService: text("time_of_service").notNull(), // HH:MM format
  customPrompt: text("custom_prompt").notNull(), // Specific questions/prompts for this call
  status: text("status").notNull().default("pending"), // pending, scheduled, completed, failed
  priority: text("priority").notNull().default("normal"), // urgent, high, normal, low
  attemptCount: integer("attempt_count").default(0),
  lastAttempt: timestamp("last_attempt"),
  scheduledFor: timestamp("scheduled_for"), // When the call should be made
  completedAt: timestamp("completed_at"),
  callId: integer("call_id").references(() => calls.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const insertCallWorklistSchema = createInsertSchema(callWorklist).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  createdAt: true,
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Call = typeof calls.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type ScheduledCall = typeof scheduledCalls.$inferSelect;
export type InsertScheduledCall = z.infer<typeof insertScheduledCallSchema>;
export type CallWorklist = typeof callWorklist.$inferSelect;
export type InsertCallWorklist = z.infer<typeof insertCallWorklistSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
