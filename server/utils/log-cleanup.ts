import fs from 'fs/promises';
import path from 'path';

export class LogCleanup {
  private static instance: LogCleanup;
  private readonly logsDir = path.join(process.cwd(), 'conversation_logs');
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Clean up logs every 6 hours
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 6 * 60 * 60 * 1000);
  }

  static getInstance(): LogCleanup {
    if (!LogCleanup.instance) {
      LogCleanup.instance = new LogCleanup();
    }
    return LogCleanup.instance;
  }

  private async performCleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.logsDir);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.txt')) continue;
        
        const filePath = path.join(this.logsDir, file);
        const stats = await fs.stat(filePath);
        const age = now - stats.mtime.getTime();

        if (age > maxAge) {
          await fs.unlink(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[LOG-CLEANUP] Removed ${cleaned} old conversation logs`);
      }
    } catch (error) {
      console.error('[LOG-CLEANUP] Error during cleanup:', error);
    }
  }

  async getLogStats() {
    try {
      const files = await fs.readdir(this.logsDir);
      const logFiles = files.filter(f => f.endsWith('.txt'));
      
      let totalSize = 0;
      for (const file of logFiles) {
        const stats = await fs.stat(path.join(this.logsDir, file));
        totalSize += stats.size;
      }

      return {
        count: logFiles.length,
        totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
      };
    } catch (error) {
      return { count: 0, totalSizeMB: 0 };
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const logCleanup = LogCleanup.getInstance();