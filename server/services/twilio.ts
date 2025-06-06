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

  generateTwiML(message: string, shouldRecord: boolean = true, voiceConfig?: VoiceConfig, callId?: number): string {
    // Use the correct Replit domain for speech processing webhook
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
      `https://${process.env.REPLIT_DEV_DOMAIN}` : 
      'https://fe1cf261-06d9-4ef6-9ad5-17777e1affd0-00-2u5ajlr2fy6bm.riker.replit.dev';
    
    const recordingUrl = `${baseUrl}/api/calls/recording`;
    
    // Use basic voice that Twilio supports reliably
    const voice = voiceConfig?.voice || 'alice';
    
    // Clean message to avoid XML/SSML conflicts
    const cleanMessage = message.replace(/[<>&"']/g, '');
    
    if (shouldRecord) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${cleanMessage}</Say>
  <Record action="${recordingUrl}" method="POST" maxLength="30" finishOnKey="#" transcribe="true" transcribeCallback="${baseUrl}/api/calls/transcription">
    <Say voice="${voice}">Please speak your response after the beep, and press pound when finished.</Say>
  </Record>
</Response>`;
    } else {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${cleanMessage}</Say>
</Response>`;
    }
  }

  // Enhanced method for conversational TwiML with automatic continuation
  generateConversationalTwiML(message: string, callId: number, shouldContinue: boolean = true): string {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
      `https://${process.env.REPLIT_DEV_DOMAIN}` : 
      'https://fe1cf261-06d9-4ef6-9ad5-17777e1affd0-00-2u5ajlr2fy6bm.riker.replit.dev';
    
    const voice = 'alice';
    const cleanMessage = message.replace(/[<>&"']/g, '');
    
    if (shouldContinue) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${cleanMessage}</Say>
  <Record action="${baseUrl}/api/calls/recording" method="POST" maxLength="30" finishOnKey="#" transcribe="true" transcribeCallback="${baseUrl}/api/calls/transcription">
    <Say voice="${voice}">Please respond after the beep.</Say>
  </Record>
</Response>`;
    } else {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${cleanMessage}</Say>
  <Hangup/>
</Response>`;
    }
  }
}

export const twilioService = new TwilioService();
