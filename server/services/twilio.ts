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
    // Use dynamic domain detection for webhooks
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
      `https://${process.env.REPLIT_DEV_DOMAIN}` : 
      process.env.REPL_SLUG ? 
        `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` :
        'https://localhost:5000';
    
    const recordingUrl = `${baseUrl}/api/calls/recording`;
    
    // Use enhanced neural voice for more natural speech
    const voice = voiceConfig?.voice || 'Polly.Joanna-Neural';
    
    // Clean message to avoid any XML conflicts
    const cleanMessage = message.replace(/[<>&"']/g, '');
    
    if (shouldRecord) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${cleanMessage}</Say>
  <Record action="${recordingUrl}" method="POST" maxLength="30" finishOnKey="#" transcribe="true" transcribeCallback="${baseUrl}/api/calls/transcription">
    <Say voice="${voice}">Please share your response after the beep. When you're finished, just pause for a moment or press the pound key.</Say>
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
      process.env.REPL_SLUG ? 
        `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` :
        'https://localhost:5000';
    
    const voice = 'Polly.Joanna-Neural';
    
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

  // Format messages with simple SSML for natural speech patterns
  private formatWithSSML(message: string): string {
    // Clean message and avoid complex SSML that causes Twilio errors
    const cleanMessage = message.replace(/[<>&"']/g, '');
    
    // Use simple SSML that Twilio supports reliably
    return `<speak><break time="0.5s"/>${cleanMessage}<break time="0.3s"/></speak>`;
  }
}

export const twilioService = new TwilioService();
