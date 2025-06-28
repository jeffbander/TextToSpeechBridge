import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { callScheduler } from "./services/call-scheduler";
import { setupVite, serveStatic, log } from "./vite";
import { memoryMonitor } from "./utils/memory-monitor";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
const start = Date.now();
const path = req.path;
let capturedJsonResponse: Record<string, any> | undefined = undefined;

const originalResJson = res.json;
res.json = function (bodyJson, ...args) {
capturedJsonResponse = bodyJson;
return originalResJson.apply(res, [bodyJson, ...args]);
};

res.on("finish", () => {
const duration = Date.now() - start;
if (path.startsWith("/api")) {
let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
if (capturedJsonResponse) {
logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
}

if (logLine.length > 80) {
logLine = logLine.slice(0, 79) + "…";
}

log(logLine);
}
});

next();
});

(async () => {
// Health check endpoint for public accessibility - must be before Vite setup
app.get('/health', (req, res) => {
res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});



// Critical: Register API routes before Vite to prevent HTML responses
const server = await registerRoutes(app);

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
const status = err.status || err.statusCode || 500;
const message = err.message || "Internal Server Error";

console.error('EXPRESS ERROR HANDLER:', {
error: err,
message: err.message,
stack: err.stack,
url: _req.url,
method: _req.method,
headers: _req.headers,
body: _req.body
});

res.status(status).json({ message });
});

// importantly only setup vite in development and after
// setting up all the other routes so the catch-all route
// doesn't interfere with the other routes
const nodeEnv = process.env.NODE_ENV || app.get("env");
console.log(`[SERVER] Environment mode: ${nodeEnv}`);

if (nodeEnv === "development") {
await setupVite(app, server);
} else {
serveStatic(app);
}

// ALWAYS serve the app on port 5000
// this serves both the API and the client.
// It is the only port that is not firewalled.
const port = 5000;
server.listen({
port,
host: "0.0.0.0",
reusePort: true,
}, () => {
log(`serving on port ${port}`);
});
})();
