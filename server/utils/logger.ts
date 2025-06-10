// Enhanced logging utility for audio and GPT-4o debugging
export interface LogContext {
  sessionId?: string;
  patientId?: number;
  callId?: number;
  audioChunk?: number;
  timestamp?: string;
}

export class AudioLogger {
  private static formatTimestamp(): string {
    return new Date().toISOString();
  }

  private static formatContext(context: LogContext = {}): string {
    const parts = [];
    if (context.sessionId) parts.push(`Session:${context.sessionId.slice(-8)}`);
    if (context.patientId) parts.push(`Patient:${context.patientId}`);
    if (context.callId) parts.push(`Call:${context.callId}`);
    if (context.audioChunk) parts.push(`Chunk:${context.audioChunk}`);
    return parts.length > 0 ? `[${parts.join('|')}]` : '';
  }

  // Audio processing logs
  static audioReceived(length: number, format: string, context: LogContext = {}) {
    console.log(`[${this.formatTimestamp()}][AUDIO-IN]${this.formatContext(context)} Received ${length} bytes (${format})`);
  }

  static audioProcessed(inputLength: number, outputLength: number, context: LogContext = {}) {
    console.log(`[${this.formatTimestamp()}][AUDIO-PROC]${this.formatContext(context)} Processed: ${inputLength} → ${outputLength} bytes`);
  }

  static audioSent(length: number, destination: string, context: LogContext = {}) {
    console.log(`[${this.formatTimestamp()}][AUDIO-OUT]${this.formatContext(context)} Sent ${length} bytes to ${destination}`);
  }

  static audioError(error: any, operation: string, context: LogContext = {}) {
    console.error(`[${this.formatTimestamp()}][AUDIO-ERROR]${this.formatContext(context)} ${operation}:`, error);
  }

  // GPT-4o specific logs
  static gpt4oConnection(status: 'connecting' | 'connected' | 'disconnected' | 'error', context: LogContext = {}) {
    const emoji = status === 'connected' ? '✅' : status === 'error' ? '❌' : '🔄';
    console.log(`[${this.formatTimestamp()}][GPT4O-CONN]${this.formatContext(context)} ${emoji} ${status.toUpperCase()}`);
  }

  static gpt4oMessage(type: string, direction: 'in' | 'out', data: any, context: LogContext = {}) {
    const arrow = direction === 'in' ? '⬇️' : '⬆️';
    console.log(`[${this.formatTimestamp()}][GPT4O-MSG]${this.formatContext(context)} ${arrow} ${type}:`, 
      typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  }

  static gpt4oAudio(action: 'sent' | 'received' | 'buffered', size: number, context: LogContext = {}) {
    const emoji = action === 'sent' ? '📤' : action === 'received' ? '📥' : '🔄';
    console.log(`[${this.formatTimestamp()}][GPT4O-AUDIO]${this.formatContext(context)} ${emoji} ${action.toUpperCase()}: ${size} bytes`);
  }

  static gpt4oError(error: any, operation: string, context: LogContext = {}) {
    console.error(`[${this.formatTimestamp()}][GPT4O-ERROR]${this.formatContext(context)} ${operation}:`, error);
  }

  // Session management logs
  static sessionCreated(sessionId: string, patientName: string, context: LogContext = {}) {
    console.log(`[${this.formatTimestamp()}][SESSION]${this.formatContext(context)} ✨ Created for ${patientName}`);
  }

  static sessionEnded(sessionId: string, duration: number, context: LogContext = {}) {
    console.log(`[${this.formatTimestamp()}][SESSION]${this.formatContext(context)} 🏁 Ended after ${duration}ms`);
  }

  static sessionError(error: any, operation: string, context: LogContext = {}) {
    console.error(`[${this.formatTimestamp()}][SESSION-ERROR]${this.formatContext(context)} ${operation}:`, error);
  }

  // WebSocket connection logs
  static wsConnection(event: 'open' | 'close' | 'error', wsType: 'twilio' | 'gpt4o' | 'client', context: LogContext = {}) {
    const emoji = event === 'open' ? '🔌' : event === 'close' ? '🔌❌' : '⚠️';
    console.log(`[${this.formatTimestamp()}][WS-${wsType.toUpperCase()}]${this.formatContext(context)} ${emoji} ${event.toUpperCase()}`);
  }

  static wsMessage(direction: 'in' | 'out', wsType: 'twilio' | 'gpt4o' | 'client', size: number, context: LogContext = {}) {
    const arrow = direction === 'in' ? '⬇️' : '⬆️';
    console.log(`[${this.formatTimestamp()}][WS-${wsType.toUpperCase()}]${this.formatContext(context)} ${arrow} ${size} bytes`);
  }

  // Performance monitoring
  static performance(operation: string, duration: number, context: LogContext = {}) {
    const emoji = duration > 1000 ? '🐌' : duration > 500 ? '⚠️' : '⚡';
    console.log(`[${this.formatTimestamp()}][PERF]${this.formatContext(context)} ${emoji} ${operation}: ${duration}ms`);
  }

  // Buffer management
  static bufferStatus(operation: string, size: number, capacity: number, context: LogContext = {}) {
    const percentage = Math.round((size / capacity) * 100);
    const emoji = percentage > 80 ? '🔴' : percentage > 50 ? '🟡' : '🟢';
    console.log(`[${this.formatTimestamp()}][BUFFER]${this.formatContext(context)} ${emoji} ${operation}: ${size}/${capacity} (${percentage}%)`);
  }
}