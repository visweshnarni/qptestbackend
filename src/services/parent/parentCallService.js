import Outpass from "../../models/Outpass.js";
import { makeParentCall } from "../../utils/parentTwilioService.js";

// Non-blocking sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const initiateParentCalls = async (callTargets, outpassId) => {
  
  for (const target of callTargets) {
    // 1. Check fresh DB status BEFORE calling
    const outpass = await Outpass.findById(outpassId);
    
    // Check if the outpass has reached ANY state that means we should stop calling
    const isResolved = 
      !outpass || 
      outpass.parentVerification.status === "approved" || 
      outpass.parentVerification.status === "rejected" || 
      outpass.status === "approved" || 
      outpass.status === "rejected" || 
      outpass.status === "cancelled_by_student" ||
      outpass.status === "exited";

    if (isResolved) {
      console.log(`Outpass is no longer pending (Status: ${outpass?.status}). Halting initial parent calls.`);
      break; 
    }

    // 2. Initiate Call
    try {
      await makeParentCall(target.phone, outpassId);
      console.log(`Called parent: ${target.phone}`);
    } catch (error) {
      console.error("Failed to call parent:", error);
    }

    // 3. Wait 45 seconds for parent to answer and press a key
    await sleep(45000); 
  }

};