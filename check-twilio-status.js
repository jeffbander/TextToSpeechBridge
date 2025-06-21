const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function checkMessageStatus(messageSid) {
  try {
    const message = await client.messages(messageSid).fetch();
    console.log('Message Status:', {
      sid: message.sid,
      to: message.to,
      from: message.from,
      status: message.status,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      dateCreated: message.dateCreated,
      dateSent: message.dateSent,
      dateUpdated: message.dateUpdated
    });
    return message;
  } catch (error) {
    console.error('Error fetching message:', error);
  }
}

// Check Jeff Bander's message
checkMessageStatus('SMb8d7a57013e0412781081736d17da442');