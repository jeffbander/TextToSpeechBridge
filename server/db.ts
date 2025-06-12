import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 3, // Conservative limit for Neon serverless
  idleTimeoutMillis: 20000, // Aggressive cleanup of idle connections
  connectionTimeoutMillis: 5000, // Fast timeout to prevent hanging
  allowExitOnIdle: true, // Allow pool to close when no connections needed
});

export const db = drizzle({ client: pool, schema });
