import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !phoneNumber) {
  throw new Error('Twilio credentials must be provided in environment variables');
}

const client = twilio(accountSid, authToken);

export interface CallOptions {
  to: string;
  url: string; // TwiML URL for handling the call
  statusCallback?: string;
  statusCallbackEvent?: string[];
}

export class TwilioService {
  async makeCall(options: CallOptions): Promise<string> {
    try {
      const call = await client.calls.create({
        to: options.to,
        from: phoneNumber,
        url: options.url,
        statusCallback: options.statusCallback,
        statusCallbackEvent: options.statusCallbackEvent || ['initiated', 'ringing', 'answered', 'completed'],
      });
      
      return call.sid;
    } catch (error) {
      console.error('Twilio call error:', error);
      throw new Error(`Failed to initiate call: ${error.message}`);
    }
  }

  async getCallStatus(callSid: string) {
    try {
      const call = await client.calls(callSid).fetch();
      return {
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
      };
    } catch (error) {
      console.error('Twilio call status error:', error);
      throw new Error(`Failed to get call status: ${error.message}`);
    }
  }

  async endCall(callSid: string): Promise<void> {
    try {
      await client.calls(callSid).update({ status: 'completed' });
    } catch (error) {
      console.error('Twilio end call error:', error);
      throw new Error(`Failed to end call: ${error.message}`);
    }
  }

  generateTwiML(message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="alice">${message}</Say>
      <Gather input="speech" action="/api/calls/process-speech" method="POST" speechTimeout="auto">
        <Say voice="alice">Please respond after the beep.</Say>
      </Gather>
    </Response>`;
  }
}

export const twilioService = new TwilioService();
