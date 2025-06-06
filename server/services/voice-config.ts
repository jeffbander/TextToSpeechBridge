export interface VoiceProfile {
  id: string;
  name: string;
  voice: string;
  rate: string;
  pitch: string;
  language: string;
  personality: {
    tone: 'professional' | 'warm' | 'empathetic' | 'clinical';
    pace: 'slow' | 'normal' | 'brisk';
    formality: 'formal' | 'conversational' | 'friendly';
  };
  medicalSpecialty?: 'cardiology' | 'general' | 'pulmonary';
}

export class VoiceConfigManager {
  private voiceProfiles: Map<string, VoiceProfile> = new Map();

  constructor() {
    this.initializeDefaultProfiles();
  }

  private initializeDefaultProfiles(): void {
    // CardioCare Standard - Empathetic and professional
    this.voiceProfiles.set('cardiocare-standard', {
      id: 'cardiocare-standard',
      name: 'CardioCare Standard',
      voice: 'Polly.Joanna-Neural',
      rate: 'medium',
      pitch: 'medium',
      language: 'en-US',
      personality: {
        tone: 'empathetic',
        pace: 'normal',
        formality: 'conversational'
      },
      medicalSpecialty: 'cardiology'
    });

    // Clinical Professional - More formal and precise
    this.voiceProfiles.set('clinical-professional', {
      id: 'clinical-professional',
      name: 'Clinical Professional',
      voice: 'Polly.Matthew-Neural',
      rate: 'slow',
      pitch: 'low',
      language: 'en-US',
      personality: {
        tone: 'professional',
        pace: 'slow',
        formality: 'formal'
      },
      medicalSpecialty: 'general'
    });

    // Warm Companion - Friendly and reassuring
    this.voiceProfiles.set('warm-companion', {
      id: 'warm-companion',
      name: 'Warm Companion',
      voice: 'Polly.Amy-Neural',
      rate: 'medium',
      pitch: 'medium',
      language: 'en-US',
      personality: {
        tone: 'warm',
        pace: 'normal',
        formality: 'friendly'
      }
    });

    // Urgent Care - Clear and direct
    this.voiceProfiles.set('urgent-care', {
      id: 'urgent-care',
      name: 'Urgent Care',
      voice: 'Polly.Joanna-Neural',
      rate: 'fast',
      pitch: 'high',
      language: 'en-US',
      personality: {
        tone: 'clinical',
        pace: 'brisk',
        formality: 'formal'
      }
    });
  }

  getProfile(profileId: string): VoiceProfile | undefined {
    return this.voiceProfiles.get(profileId);
  }

  getAllProfiles(): VoiceProfile[] {
    return Array.from(this.voiceProfiles.values());
  }

  getProfileForCondition(condition: string): VoiceProfile {
    // Match voice profile to medical condition
    if (condition.toLowerCase().includes('cardiac') || condition.toLowerCase().includes('heart')) {
      return this.getProfile('cardiocare-standard') || this.getDefaultProfile();
    }
    
    if (condition.toLowerCase().includes('urgent') || condition.toLowerCase().includes('critical')) {
      return this.getProfile('urgent-care') || this.getDefaultProfile();
    }
    
    return this.getDefaultProfile();
  }

  getDefaultProfile(): VoiceProfile {
    return this.getProfile('cardiocare-standard')!;
  }

  createCustomProfile(profile: Omit<VoiceProfile, 'id'>): VoiceProfile {
    const id = `custom-${Date.now()}`;
    const customProfile: VoiceProfile = { ...profile, id };
    this.voiceProfiles.set(id, customProfile);
    return customProfile;
  }

  // Convert profile to Twilio voice config
  toTwilioConfig(profile: VoiceProfile) {
    return {
      voice: profile.voice,
      rate: profile.rate,
      pitch: profile.pitch,
      language: profile.language
    };
  }

  // Generate SSML with personality adjustments
  generateSSML(text: string, profile: VoiceProfile): string {
    const { personality } = profile;
    
    let ssmlText = text;
    
    // Add personality-based modifications
    if (personality.tone === 'warm') {
      ssmlText = ssmlText.replace(/\./g, '. <break time="0.3s"/>');
    }
    
    if (personality.tone === 'empathetic') {
      ssmlText = ssmlText.replace(/(?:pain|concern|worry|difficult)/gi, '<emphasis level="moderate">$&</emphasis>');
    }
    
    if (personality.pace === 'slow') {
      ssmlText = `<prosody rate="85%">${ssmlText}</prosody>`;
    } else if (personality.pace === 'brisk') {
      ssmlText = `<prosody rate="115%">${ssmlText}</prosody>`;
    }
    
    // Add breathing room for natural speech
    const finalSSML = `<speak>
      <break time="0.5s"/>
      ${ssmlText}
      <break time="0.8s"/>
    </speak>`;
    
    return finalSSML;
  }
}

export const voiceConfigManager = new VoiceConfigManager();