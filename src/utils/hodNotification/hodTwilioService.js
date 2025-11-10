import dotenv from 'dotenv';
dotenv.config();
import pkg from 'twilio';
const { VoiceResponse } = pkg.twiml;
const client = pkg(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Make a Twilio call to HOD with a summary voice message.
 */
export const makeHodSummaryCall = async (hodPhone, pendingCount) => {
  try {
    if (!hodPhone.startsWith('+91')) hodPhone = `+91${hodPhone}`;

    const twimlResponse = new VoiceResponse();
    twimlResponse.say(
      { voice: 'alice', language: 'en-IN' },
      `Hello professor. You have ${pendingCount} student outpass requests awaiting approval in QuickPass. 
      Please review them at your earliest convenience. Thank you.`
    );
    twimlResponse.hangup();

    const twimlUrl = `${process.env.NGROK_URL}/api/outpass/hod-callback`;

    await client.calls.create({
      to: hodPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: twimlResponse.toString(),
      url: twimlUrl,
    });

    console.log(`📞 HOD Call placed to ${hodPhone}`);
  } catch (error) {
    console.error(`❌ Failed to call HOD (${hodPhone}):`, error.message);
  }
};
