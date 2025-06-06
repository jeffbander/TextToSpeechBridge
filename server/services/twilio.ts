import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize client only if credentials are valid
let client: ReturnType<typeof twilio> | null = null;

const initializeTwilioClient = () => {
  if (!accountSid || !authToken || !phoneNumber) {
    console.warn('Twilio credentials not provided. Call functionality will be disabled.');
    return false;
  }
  
  if (!accountSid.startsWith('AC')) {
    console.warn('Invalid Twilio Account SID format. Must start with "AC".');
    return false;
  }
  
  try {
    client = twilio(accountSid, authToken);
    console.log('Twilio client initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize Twilio client:', error);
    return false;
  }
};

// Try to initialize on module load
initializeTwilioClient();

export interface CallOptions {
  to: string;
  url: string; // TwiML URL for handling the call
  statusCallback?: string;
  statusCallbackEvent?: string[];
}

export interface VoiceConfig {
  voice?: string; // Polly.Joanna-Neural, Polly.Matthew-Neural, alice, man, woman
  rate?: string; // x-slow, slow, medium, fast, x-fast
  pitch?: string; // x-low, low, medium, high, x-high
  language?: string; // en-US, es-ES, etc.
}

export class TwilioService {
  private ensureClientInitialized(): void {
    if (!client) {
      throw new Error('Twilio client not initialized. Please check your Twilio credentials.');
    }
  }

  async makeCall(options: CallOptions): Promise<string> {
    this.ensureClientInitialized();
    
    try {
      const call = await client!.calls.create({
        to: options.to,
        from: phoneNumber!,
        url: options.url,
        statusCallback: options.statusCallback,
        statusCallbackEvent: options.statusCallbackEvent || ['initiated', 'ringing', 'answered', 'completed'],
      });
      
      return call.sid;
    } catch (error: any) {
      console.error('Twilio call error:', error);
      throw new Error(`Failed to initiate call: ${error.message}`);
    }
  }

  async getCallStatus(callSid: string) {
    this.ensureClientInitialized();
    
    try {
      const call = await client!.calls(callSid).fetch();
      return {
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
      };
    } catch (error: any) {
      console.error('Twilio call status error:', error);
      throw new Error(`Failed to get call status: ${error.message}`);
    }
  }

  async endCall(callSid: string): Promise<void> {
    this.ensureClientInitialized();
    
    try {
      await client!.calls(callSid).update({ status: 'completed' });
    } catch (error: any) {
      console.error('Twilio end call error:', error);
      throw new Error(`Failed to end call: ${error.message}`);
    }
  }

  generateTwiML(message: string, shouldRecord: boolean = true, voiceConfig?: VoiceConfig): string {
    // Use the correct Replit domain for speech processing webhook
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
      `https://${process.env.REPLIT_DEV_DOMAIN}` : 
      'https://fe1cf261-06d9-4ef6-9ad5-17777e1affd0-00-2u5ajlr2fy6bm.riker.replit.dev';
    
    const speechProcessingUrl = `${baseUrl}/api/calls/process-speech`;
    const recordingUrl = `${baseUrl}/api/calls/recording`;
    
    // Enhanced voice configuration for more natural speech
    const voice = voiceConfig?.voice || 'Polly.Joanna-Neural';
    const rate = voiceConfig?.rate || 'medium';
    const pitch = voiceConfig?.pitch || 'medium';
    
    // SSML for more natural speech patterns
    const formatMessage = (text: string) => {
      return `<speak>
        <prosody rate="${rate}" pitch="${pitch}">
          <break time="0.5s"/>
          ${text}
          <break time="0.8s"/>
        </prosody>
      </speak>`;
    };
    
    if (shouldRecord) {
      return `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="${voice}">${formatMessage(message)}</Say>
        <Pause length="1"/>
        <Record action="${recordingUrl}" method="POST" maxLength="60" finishOnKey="#" transcribe="true" transcribeCallback="${baseUrl}/api/calls/transcription" recordingStatusCallback="${baseUrl}/api/calls/recording-status">
          <Say voice="${voice}">
            <speak>
              <prosody rate="slow" pitch="low">
                <break time="0.5s"/>
                Please share your response after the tone. When you're finished, press the pound key or simply pause for a few seconds.
                <break time="1s"/>
              </prosody>
            </speak>
          </Say>
        </Record>
        <Say voice="${voice}">
          <speak>
            <prosody rate="medium" pitch="medium">
              <break time="0.5s"/>
              Thank you for sharing. I'm now processing your response and will continue our conversation shortly.
              <break time="1s"/>
            </prosody>
          </speak>
        </Say>
      </Response>`;
    } else {
      return `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="${voice}">${formatMessage(message)}</Say>
        <Gather input="speech" action="${speechProcessingUrl}" method="POST" speechTimeout="auto" speechModel="experimental_conversations" enhanced="true">
          <Say voice="${voice}">
            <speak>
              <prosody rate="slow" pitch="low">
                Please respond after the tone.
              </prosody>
            </speak>
          </Say>
        </Gather>
      </Response>`;
    }
  }
}

export const twilioService = new TwilioService();
