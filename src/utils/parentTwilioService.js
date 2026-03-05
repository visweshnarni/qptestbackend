import pkg from "twilio";
import dotenv from "dotenv";
dotenv.config();

const twilio = pkg;

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const makeParentCall = async (phone, outpassId) => {

  if (!phone.startsWith("+")) {
    phone = `+91${phone}`;
  }

  const callbackUrl =
    `${process.env.NGROK_URL}/api/parent-ivr/menu?outpassId=${outpassId}`;

  await client.calls.create({
    to: phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    url: callbackUrl,
  });

  console.log("Parent IVR call initiated:", phone);
};