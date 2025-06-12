// Connection rate limiting and resource management
export class ConnectionLimiter {
  private static instance: ConnectionLimiter;
  private requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly maxRequestsPerMinute = 10;
  private readonly windowMs = 60000; // 1 minute

  static getInstance(): ConnectionLimiter {
    if (!ConnectionLimiter.instance) {
      ConnectionLimiter.instance = new ConnectionLimiter();
    }
    return ConnectionLimiter.instance;
  }

  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const client = this.requestCounts.get(clientId);

    if (!client || now > client.resetTime) {
      this.requestCounts.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (client.count >= this.maxRequestsPerMinute) {
      return false;
    }

    client.count++;
    return true;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [clientId, data] of this.requestCounts.entries()) {
      if (now > data.resetTime) {
        this.requestCounts.delete(clientId);
      }
    }
  }
}

export const connectionLimiter = ConnectionLimiter.getInstance();