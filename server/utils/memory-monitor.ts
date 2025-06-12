// Memory monitoring and cleanup utilities
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private cleanupInterval: NodeJS.Timeout;
  private connections = new Map<string, any>();
  private lastCleanup = Date.now();

  private constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000);

    // Log memory usage every 10 minutes in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const usage = process.memoryUsage();
        console.log(`[MEMORY] RSS: ${Math.round(usage.rss / 1024 / 1024)}MB, Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB, Connections: ${this.connections.size}`);
      }, 10 * 60 * 1000);
    }
  }

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  addConnection(id: string, connection: any): void {
    this.connections.set(id, {
      connection,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
  }

  updateActivity(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastActivity = Date.now();
    }
  }

  removeConnection(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      try {
        if (conn.connection && typeof conn.connection.close === 'function') {
          conn.connection.close();
        }
      } catch (error) {
        console.error(`[MEMORY] Error closing connection ${id}:`, error);
      }
      this.connections.delete(id);
    }
  }

  private performCleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const maxIdle = 10 * 60 * 1000; // 10 minutes

    let cleaned = 0;
    for (const [id, data] of this.connections.entries()) {
      const age = now - data.createdAt;
      const idle = now - data.lastActivity;

      if (age > maxAge || idle > maxIdle) {
        this.removeConnection(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[MEMORY] Cleaned up ${cleaned} stale connections`);
    }

    // Force garbage collection if available
    if (global.gc && cleaned > 0) {
      global.gc();
    }

    this.lastCleanup = now;
  }

  getStats() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      connections: this.connections.size,
      lastCleanup: this.lastCleanup
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.connections.clear();
  }
}

export const memoryMonitor = MemoryMonitor.getInstance();