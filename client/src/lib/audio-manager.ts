// Singleton audio manager to prevent multiple simultaneous audio playback
class AudioManager {
  private static instance: AudioManager | null = null;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private audioBuffer: number[] = [];
  private instanceId: string;
  
  private constructor() {
    this.instanceId = Math.random().toString(36).substring(7);
    console.log(`[AUDIO-MANAGER] Creating new instance: ${this.instanceId}`);
  }
  
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }
  
  async initialize(): Promise<void> {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000
        });
        console.log('[AUDIO-MANAGER] AudioContext created, state:', this.audioContext.state);
      }
      
      if (this.audioContext.state === 'suspended') {
        console.log('[AUDIO-MANAGER] Resuming suspended AudioContext');
        await this.audioContext.resume();
        console.log('[AUDIO-MANAGER] AudioContext resumed, new state:', this.audioContext.state);
      }
    } catch (error) {
      console.error('[AUDIO-MANAGER] Failed to initialize AudioContext:', error);
      throw error;
    }
  }
  
  // Stop any currently playing audio immediately
  stopCurrentAudio(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // Source may already be stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    // Don't clear audioBuffer here - only clear after successful playback
  }
  
  // Add audio data to buffer (for streaming)
  addAudioData(pcmData: Int16Array): void {
    const beforeLength = this.audioBuffer.length;
    for (let i = 0; i < pcmData.length; i++) {
      this.audioBuffer.push(pcmData[i] / 32768.0);
    }
    const afterLength = this.audioBuffer.length;
    console.log(`[AUDIO-MANAGER-${this.instanceId}] Buffer: ${beforeLength} → ${afterLength} (+${pcmData.length} samples)`);
  }
  
  // Play accumulated audio buffer
  async playAccumulatedAudio(): Promise<void> {
    const bufferLengthAtStart = this.audioBuffer.length;
    console.log(`[AUDIO-MANAGER-${this.instanceId}] playAccumulatedAudio called - buffer length:`, bufferLengthAtStart, 'context:', !!this.audioContext);
    
    if (!this.audioContext) {
      console.log('[AUDIO-MANAGER] No AudioContext available');
      return;
    }
    
    if (bufferLengthAtStart === 0) {
      console.log('[AUDIO-MANAGER] No audio samples to play');
      return;
    }
    
    // Prevent overlapping audio playback
    if (this.isPlaying) {
      console.log('[AUDIO-MANAGER] Blocking playback - audio already playing');
      return;
    }
    
    try {
      // Ensure AudioContext is running
      if (this.audioContext.state !== 'running') {
        console.log('[AUDIO-MANAGER] AudioContext not running, state:', this.audioContext.state);
        await this.audioContext.resume();
        console.log('[AUDIO-MANAGER] AudioContext state after resume:', this.audioContext.state);
      }
      
      // Stop any previous audio source but preserve buffer
      if (this.currentSource) {
        try {
          this.currentSource.stop();
          this.currentSource.disconnect();
        } catch (e) {
          // Source may already be stopped
        }
        this.currentSource = null;
      }
      
      // Create audio buffer from accumulated samples
      const sampleCount = this.audioBuffer.length;
      console.log('[AUDIO-MANAGER] About to create AudioBuffer - current buffer length:', sampleCount, 'initial length:', bufferLengthAtStart);
      
      if (sampleCount === 0) {
        console.error('[AUDIO-MANAGER] Buffer was cleared between start and playback! Initial:', bufferLengthAtStart, 'Current:', sampleCount);
        return;
      }
      
      const audioBuffer = this.audioContext.createBuffer(1, sampleCount, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      // Copy audio data with bounds checking
      for (let i = 0; i < sampleCount; i++) {
        const sample = this.audioBuffer[i];
        // Clamp sample values to valid range [-1, 1]
        channelData[i] = Math.max(-1, Math.min(1, sample));
      }
      
      // Create and configure audio source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      this.currentSource = source;
      this.isPlaying = true;
      
      source.onended = () => {
        this.currentSource = null;
        this.isPlaying = false;
        console.log('[AUDIO-MANAGER] Audio playback completed');
      };
      
      // Start playback
      source.start(0);
      const duration = (sampleCount / 24000).toFixed(1);
      console.log('[AUDIO-MANAGER] Successfully started playing', sampleCount, 'samples (' + duration + 's)');
      
      // Clear buffer after starting playback
      this.audioBuffer = [];
      
    } catch (error) {
      console.error('[AUDIO-MANAGER] Playback error:', error);
      this.isPlaying = false;
      this.currentSource = null;
      this.audioBuffer = [];
    }
  }
  
  // Test audio playback with a simple tone
  async testAudioPlayback(): Promise<boolean> {
    try {
      console.log('[AUDIO-MANAGER] Starting audio test');
      await this.initialize();
      
      if (!this.audioContext) {
        console.log('[AUDIO-MANAGER] No audio context available for test');
        return false;
      }
      
      // Generate a short test tone (440Hz for 0.5 seconds)
      const sampleRate = 24000;
      const duration = 0.5;
      const frequency = 440;
      const sampleCount = Math.floor(sampleRate * duration);
      
      const testBuffer = this.audioContext.createBuffer(1, sampleCount, sampleRate);
      const channelData = testBuffer.getChannelData(0);
      
      for (let i = 0; i < sampleCount; i++) {
        channelData[i] = 0.1 * Math.sin(2 * Math.PI * frequency * i / sampleRate);
      }
      
      const source = this.audioContext.createBufferSource();
      source.buffer = testBuffer;
      source.connect(this.audioContext.destination);
      
      return new Promise((resolve) => {
        source.onended = () => {
          console.log('[AUDIO-MANAGER] Test tone playback completed successfully');
          resolve(true);
        };
        
        try {
          source.start(0);
          console.log('[AUDIO-MANAGER] Started test tone playback');
        } catch (error) {
          console.error('[AUDIO-MANAGER] Failed to start test tone:', error);
          resolve(false);
        }
      });
      
    } catch (error) {
      console.error('[AUDIO-MANAGER] Test playback error:', error);
      return false;
    }
  }
  
  // Check if currently playing audio
  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }
  
  // Cleanup resources
  cleanup(): void {
    this.stopCurrentAudio();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const audioManager = AudioManager.getInstance();