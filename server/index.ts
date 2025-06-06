import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

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

  // Critical TwiML webhook handler - must be before Vite setup
  app.get('/api/calls/twiml/:id', (req, res) => {
    console.log('🎯 CRITICAL TwiML ENDPOINT HIT - Call ID:', req.params.id);
    console.log('📞 Request origin:', req.get('User-Agent'));
    console.log('🌐 Request IP:', req.ip);
    
    res.set({
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is CardioCare calling for your health check. How are you feeling today?</Say>
  <Record action="https://fe1cf261-06d9-4ef6-9ad5-17777e1affd0-00-2u5ajlr2fy6bm.riker.replit.dev/api/calls/recording" method="POST" maxLength="30" finishOnKey="#" transcribe="true" transcribeCallback="https://fe1cf261-06d9-4ef6-9ad5-17777e1affd0-00-2u5ajlr2fy6bm.riker.replit.dev/api/calls/transcription">
    <Say voice="alice">Please speak your response after the beep, and press pound when finished.</Say>
  </Record>
  <Say voice="alice">Thank you. Please hold while I process your response.</Say>
</Response>`;
    
    console.log('✅ Sending TwiML response:', twiml.length, 'bytes');
    res.send(twiml);
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
  if (app.get("env") === "development") {
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
