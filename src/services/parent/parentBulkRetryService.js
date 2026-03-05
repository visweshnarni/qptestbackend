import Outpass from "../../models/Outpass.js";
import { makeParentCall } from "../../utils/parentTwilioService.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const processBulkParentRetries = async () => {
  console.log("🔍 Running Bulk Parent Retry Check...");

  // 1. Find all outpasses that need parent verification AND haven't exceeded 3 attempts
  // We ignore approved, rejected, or cancelled outpasses.
  const pendingOutpasses = await Outpass.find({
    status: { $in: ["pending_parent", "pending_faculty", "pending_hod"] },
    "parentVerification.status": "pending",
    "parentVerification.callAttempts": { $lt: 3 } // Stop after 3 attempts
  });

  if (pendingOutpasses.length === 0) {
    console.log("✅ No pending parent verifications found.");
    return;
  }

  console.log(`Found ${pendingOutpasses.length} outpasses pending parent verification.`);

  // 2. Process ALL of these outpasses at the same time (concurrently)
  // BUT the parents for each outpass will be called one-by-one (sequentially)
  const retryPromises = pendingOutpasses.map(async (outpass) => {
    
    console.log(`📞 Initiating retry for Outpass ID: ${outpass._id}`);
    const targets = outpass.parentVerification.callTargets;
    let parentResponded = false;

    // Call parents ONE-BY-ONE for this specific outpass
    for (const target of targets) {
      
      // Check the database fresh right before making the call
      // In case they just approved it on the dashboard 5 seconds ago
      const freshCheck = await Outpass.findById(outpass._id);
      if (
        freshCheck.parentVerification.status === "approved" || 
        freshCheck.parentVerification.status === "rejected"
      ) {
        console.log(`✅ Outpass ${outpass._id} already resolved by parent. Halting calls.`);
        parentResponded = true;
        break; 
      }

      try {
        console.log(`Ringing ${target.phone} for outpass ${outpass._id}...`);
        await makeParentCall(target.phone, outpass._id);
      } catch (err) {
        console.error(`❌ Parent retry call failed for ${target.phone}:`, err.message);
      }

      // Wait 45 seconds for THIS parent to answer before trying the next parent
      await sleep(45000);
      
      // Check immediately after the wait to see if the IVR updated the DB
      const postWaitCheck = await Outpass.findById(outpass._id);
      if (
        postWaitCheck.parentVerification.status === "approved" || 
        postWaitCheck.parentVerification.status === "rejected"
      ) {
        console.log(`✅ Parent answered and resolved Outpass ${outpass._id}. Halting next calls.`);
        parentResponded = true;
        break;
      }
    }

    // 3. Update the call attempts after we finish the loop for this outpass
    if (!parentResponded) {
      const finalCheck = await Outpass.findById(outpass._id);
      finalCheck.parentVerification.callAttempts += 1;
      finalCheck.parentVerification.lastCallAt = new Date();

      // If we hit 3 attempts and no one answered, mark as no_response
      if (finalCheck.parentVerification.callAttempts >= 3) {
        finalCheck.parentVerification.status = "no_response";
        console.log(`⚠️ Outpass ${outpass._id} reached max parent call attempts (No Response).`);
      }
      
      await finalCheck.save();
    }
  });

  // Execute all outpass flows simultaneously
  await Promise.all(retryPromises);
  console.log("🏁 Bulk Parent Retry Check Completed.");
};