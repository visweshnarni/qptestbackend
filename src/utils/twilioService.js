import dotenv from 'dotenv';
dotenv.config();

import pkg from 'twilio';
const twilio = pkg;
const { twiml } = pkg;
const { VoiceResponse } = twiml;

// --- Twilio credentials from .env ---
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
const ngrokUrl = process.env.NGROK_URL;

const client = twilio(accountSid, authToken);

/**
 * Initiates a notification call to a faculty member.
 * @param {string} facultyPhone - The faculty's phone number
 */
export const makeNotificationCall = async (facultyPhone) => {
  if (!facultyPhone || !ngrokUrl || !twilioNumber) {
    console.error('⚠️ Twilio config missing. Call not made.');
    return;
  }

  // Ensure number is in E.164 format
  if (!facultyPhone.startsWith('+')) {
    if (facultyPhone.length === 10) {
      facultyPhone = `+91${facultyPhone}`; // Default India
    } else {
      console.warn(`⚠️ Invalid phone format (${facultyPhone}). Expected E.164 (+91XXXXXXXXXX).`);
      return;
    }
  }

  try {
    const twimlUrl = `${ngrokUrl}/api/outpass/twilio-callback`;
    console.log(`📞 Initiating call to: ${facultyPhone}`);

    await client.calls.create({
      to: facultyPhone,
      from: twilioNumber,
      url: twimlUrl,
    });

  } catch (error) {
    console.error(`❌ Twilio call to ${facultyPhone} failed:`, error.message);
  }
};

/**
 * Generates TwiML for a voice call — uses text-to-speech.
 */
export const getTwilioVoiceResponse = () => {
  const response = new VoiceResponse();

  response.say(
    {
      voice: 'alice',
      language: 'en-IN', // Indian English accent
    },
    'Hello professor. A student has applied for an outpass. '
    + 'Please check your QuickPass dashboard to review and approve the request.'
  );

  response.pause({ length: 1 });
  response.say({ voice: 'alice' }, 'Thank you.');
  response.hangup();

  return response.toString();
};
