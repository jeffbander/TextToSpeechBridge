// Singleton audio manager to prevent multiple simultaneous audio playback
class AudioManager {
  private static instance: AudioManager | null = null;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private audioBuffer: number[] = [];
  
  private constructor() {}
  
  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }
  
  async initialize(): Promise<void> {
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
    this.audioBuffer = [];
  }
  
  // Add audio data to buffer (for streaming)
  addAudioData(pcmData: Int16Array): void {
    for (let i = 0; i < pcmData.length; i++) {
      this.audioBuffer.push(pcmData[i] / 32768.0);
    }
  }
  
  // Play accumulated audio buffer
  async playAccumulatedAudio(): Promise<void> {
    console.log('[AUDIO-MANAGER] playAccumulatedAudio called - buffer length:', this.audioBuffer.length, 'context:', !!this.audioContext);
    if (!this.audioContext || this.audioBuffer.length === 0) {
      console.log('[AUDIO-MANAGER] Skipping playback - no context or empty buffer');
      return;
    }
    
    // Prevent overlapping audio playback
    if (this.isPlaying) {
      console.log('[AUDIO-MANAGER] Blocking playback - audio already playing');
      return;
    }
    
    try {
      await this.initialize();
      
      // Stop any previous audio first
      this.stopCurrentAudio();
      
      // Create audio buffer from accumulated samples
      const sampleCount = this.audioBuffer.length;
      const audioBuffer = this.audioContext.createBuffer(1, sampleCount, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      for (let i = 0; i < sampleCount; i++) {
        channelData[i] = this.audioBuffer[i];
      }
      
      // Play the audio
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      this.currentSource = source;
      this.isPlaying = true;
      
      source.onended = () => {
        this.currentSource = null;
        this.isPlaying = false;
        this.audioBuffer = [];
        console.log('[AUDIO-MANAGER] Audio playback completed');
      };
      
      source.start();
      const duration = (sampleCount / 24000).toFixed(1);
      console.log('[AUDIO-MANAGER] Started playing', sampleCount, 'samples (', duration, 's)');
      
      // Clear buffer after starting playback
      this.audioBuffer = [];
      
    } catch (error) {
      console.error('[AUDIO-MANAGER] Playback error:', error);
      this.isPlaying = false;
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