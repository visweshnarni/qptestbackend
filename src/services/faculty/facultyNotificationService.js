import Outpass from "../../models/Outpass.js";
import { sendNotificationEmail } from "../../utils/emailService.js";
import { makeNotificationCall } from "../../utils/twilioService.js";
import { getNotificationTargets } from "../../utils/notificationFinder.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const notifyFacultyForOutpass = async (student, outpass) => {
  const facultyTargets = await getNotificationTargets(student, outpass);

  // Save the targets immediately so the background job knows who was assigned
  outpass.notifiedFaculty = facultyTargets.map(f => f._id);
  await outpass.save();

  for (const faculty of facultyTargets) {
    // 1. Check fresh DB status BEFORE calling/emailing
    const freshOutpass = await Outpass.findById(outpass._id);
    
    // Define states that mean we should stop notifying faculties
    const terminalStates = [
      "pending_hod", 
      "approved", 
      "rejected", 
      "cancelled_by_student", 
      "exited"
    ];

    if (!freshOutpass || terminalStates.includes(freshOutpass.status)) {
       console.log(`Outpass resolved or escalated (Status: ${freshOutpass?.status}). Halting faculty notifications.`);
       break;
    }

    try {
      await sendNotificationEmail(faculty, student, freshOutpass);
      await makeNotificationCall(faculty.phone);
      console.log(`Notified faculty: ${faculty.name}`);
    } catch (error) {
      console.error(`Failed to notify faculty ${faculty.name}:`, error);
    }

    // 2. Wait 45 seconds before calling the next faculty
    await sleep(45000);
  }

  return facultyTargets;
};