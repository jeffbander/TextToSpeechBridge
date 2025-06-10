// Comprehensive error tracking for audio and GPT-4o issues
import { AudioLogger } from './logger';

export interface ErrorContext {
  sessionId?: string;
  patientId?: number;
  operation?: string;
  audioChunk?: number;
  timestamp?: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class ErrorTracker {
  private static errors: Map<string, ErrorContext[]> = new Map();
  private static maxErrorsPerSession = 50;

  static trackError(error: any, context: ErrorContext) {
    const sessionId = context.sessionId || 'global';
    
    if (!this.errors.has(sessionId)) {
      this.errors.set(sessionId, []);
    }
    
    const sessionErrors = this.errors.get(sessionId)!;
    
    // Add new error with full context
    const errorRecord: ErrorContext = {
      ...context,
      timestamp: new Date()
    };
    
    sessionErrors.push(errorRecord);
    
    // Limit error history per session
    if (sessionErrors.length > this.maxErrorsPerSession) {
      sessionErrors.shift();
    }
    
    // Log error with appropriate severity
    this.logError(error, errorRecord);
    
    // Check for critical patterns
    this.analyzeErrorPatterns(sessionId);
  }

  private static logError(error: any, context: ErrorContext) {
    const logMessage = `${context.operation || 'Unknown'} - ${error.message || error}`;
    
    switch (context.severity) {
      case 'critical':
        console.error(`🚨 CRITICAL ERROR [${context.sessionId}]:`, logMessage, error);
        break;
      case 'high':
        console.error(`🔴 HIGH ERROR [${context.sessionId}]:`, logMessage);
        break;
      case 'medium':
        console.warn(`🟡 MEDIUM ERROR [${context.sessionId}]:`, logMessage);
        break;
      case 'low':
        console.log(`🟢 LOW ERROR [${context.sessionId}]:`, logMessage);
        break;
    }
  }

  private static analyzeErrorPatterns(sessionId: string) {
    const sessionErrors = this.errors.get(sessionId) || [];
    const recentErrors = sessionErrors.filter(e => 
      Date.now() - e.timestamp!.getTime() < 30000 // Last 30 seconds
    );

    // Check for rapid error accumulation
    if (recentErrors.length > 10) {
      console.error(`🚨 ERROR STORM DETECTED [${sessionId}]: ${recentErrors.length} errors in 30s`);
      this.suggestRecovery(sessionId, 'error_storm');
    }

    // Check for audio processing failures
    const audioErrors = recentErrors.filter(e => e.operation?.includes('audio'));
    if (audioErrors.length > 5) {
      console.error(`🎵 AUDIO PROCESSING ISSUES [${sessionId}]: ${audioErrors.length} audio errors`);
      this.suggestRecovery(sessionId, 'audio_failure');
    }

    // Check for GPT-4o connection issues
    const gpt4oErrors = recentErrors.filter(e => e.operation?.includes('gpt4o'));
    if (gpt4oErrors.length > 3) {
      console.error(`🤖 GPT-4O CONNECTION ISSUES [${sessionId}]: ${gpt4oErrors.length} GPT-4o errors`);
      this.suggestRecovery(sessionId, 'gpt4o_failure');
    }
  }

  private static suggestRecovery(sessionId: string, issueType: 'error_storm' | 'audio_failure' | 'gpt4o_failure') {
    const suggestions: Record<string, string[]> = {
      error_storm: [
        '1. Check network connectivity',
        '2. Verify API key validity', 
        '3. Consider session restart',
        '4. Check system resources'
      ],
      audio_failure: [
        '1. Verify audio format compatibility',
        '2. Check buffer sizes and limits',
        '3. Validate WebSocket connections',
        '4. Monitor audio packet timing'
      ],
      gpt4o_failure: [
        '1. Check OpenAI API status',
        '2. Verify API key and quota',
        '3. Test WebSocket connectivity',
        '4. Consider model fallback'
      ]
    };

    console.log(`💡 RECOVERY SUGGESTIONS for ${issueType}:`);
    const suggestionList = suggestions[issueType];
    if (suggestionList) {
      suggestionList.forEach((suggestion: string) => console.log(`   ${suggestion}`));
    }
  }

  // Get error summary for session
  static getErrorSummary(sessionId: string) {
    const sessionErrors = this.errors.get(sessionId) || [];
    const last5Minutes = sessionErrors.filter(e => 
      Date.now() - e.timestamp!.getTime() < 300000
    );

    return {
      total: sessionErrors.length,
      recent: last5Minutes.length,
      critical: last5Minutes.filter(e => e.severity === 'critical').length,
      high: last5Minutes.filter(e => e.severity === 'high').length,
      operations: last5Minutes.map(e => e.operation).filter((op, index, arr) => op && arr.indexOf(op) === index),
      lastError: sessionErrors[sessionErrors.length - 1]
    };
  }

  // Clear errors for session
  static clearSession(sessionId: string) {
    this.errors.delete(sessionId);
  }

  // Get global error stats
  static getGlobalStats() {
    let totalErrors = 0;
    let activeSessions = 0;
    
    this.errors.forEach((errors, sessionId) => {
      totalErrors += errors.length;
      if (errors.some((e: ErrorContext) => Date.now() - e.timestamp!.getTime() < 300000)) {
        activeSessions++;
      }
    });

    return {
      totalErrors,
      activeSessions,
      totalSessions: this.errors.size
    };
  }
}

// Audio-specific error tracking
export class AudioErrorTracker {
  static trackBufferOverflow(sessionId: string, bufferSize: number, capacity: number) {
    ErrorTracker.trackError(
      new Error(`Buffer overflow: ${bufferSize}/${capacity}`),
      {
        sessionId,
        operation: 'audio_buffer_overflow',
        severity: 'high'
      }
    );
  }

  static trackEncodingError(sessionId: string, format: string, error: any) {
    ErrorTracker.trackError(error, {
      sessionId,
      operation: `audio_encoding_${format}`,
      severity: 'medium'
    });
  }

  static trackLatencyIssue(sessionId: string, latency: number, threshold: number) {
    ErrorTracker.trackError(
      new Error(`High latency: ${latency}ms > ${threshold}ms`),
      {
        sessionId,
        operation: 'audio_latency',
        severity: latency > threshold * 2 ? 'high' : 'medium'
      }
    );
  }

  static trackWebSocketError(sessionId: string, wsType: string, error: any) {
    ErrorTracker.trackError(error, {
      sessionId,
      operation: `websocket_${wsType}`,
      severity: 'high'
    });
  }
}

// GPT-4o specific error tracking
export class GPT4oErrorTracker {
  static trackConnectionFailure(sessionId: string, error: any) {
    ErrorTracker.trackError(error, {
      sessionId,
      operation: 'gpt4o_connection',
      severity: 'critical'
    });
  }

  static trackResponseTimeout(sessionId: string, timeout: number) {
    ErrorTracker.trackError(
      new Error(`Response timeout: ${timeout}ms`),
      {
        sessionId,
        operation: 'gpt4o_timeout',
        severity: 'high'
      }
    );
  }

  static trackInvalidResponse(sessionId: string, response: any) {
    ErrorTracker.trackError(
      new Error(`Invalid response format: ${typeof response}`),
      {
        sessionId,
        operation: 'gpt4o_invalid_response',
        severity: 'medium'
      }
    );
  }

  static trackRateLimitHit(sessionId: string) {
    ErrorTracker.trackError(
      new Error('OpenAI rate limit exceeded'),
      {
        sessionId,
        operation: 'gpt4o_rate_limit',
        severity: 'high'
      }
    );
  }
}