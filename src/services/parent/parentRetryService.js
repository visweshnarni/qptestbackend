import Outpass from "../../models/Outpass.js";
import { makeParentCall } from "../../utils/parentTwilioService.js"; // Fixed import!

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const retryParentVerification = async (outpassId) => {
  let outpass = await Outpass.findById(outpassId);
  if (!outpass) return;

  const verification = outpass.parentVerification;
  if (!verification || verification.status === "approved" || verification.status === "rejected") return;

  const targets = verification.callTargets;
  console.log(`Retrying parent verification for outpass ${outpassId}`);

  for (const target of targets) {
    // 1. Check DB before EACH retry call
    const freshCheck = await Outpass.findById(outpassId);
    if (freshCheck.parentVerification.status === "approved" || freshCheck.parentVerification.status === "rejected") {
      console.log("Parent responded. Halting retry calls.");
      break; 
    }

    try {
      await makeParentCall(target.phone, outpassId); // Pass outpassId for IVR!
    } catch (err) {
      console.error("Parent retry call failed:", err.message);
    }

    // 2. Wait 45 seconds
    await sleep(45000);
  }

  // 3. Update Attempts after the loop finishes
  outpass = await Outpass.findById(outpassId); 
  outpass.parentVerification.callAttempts += 1;
  outpass.parentVerification.lastCallAt = new Date();

  if (outpass.parentVerification.callAttempts >= 3) {
    outpass.parentVerification.status = "no_response";
  }

  await outpass.save();
};