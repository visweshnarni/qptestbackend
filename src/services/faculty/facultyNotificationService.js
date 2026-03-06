import Outpass from "../../models/Outpass.js";
import { sendNotificationEmail } from "../../utils/emailService.js";
import { makeNotificationCall } from "../../utils/twilioService.js";
import { getNotificationTargets } from "../../utils/notificationFinder.js";
import { sendAutoApprovalAcknowledgmentEmail } from "../../utils/emailService.js";

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


export const notifyMentorAndHodOfAutoApproval = async (outpassId) => {
  try {
    // 1. Deep populate to get the Mentor(s) and the HOD all in one query
    const outpass = await Outpass.findById(outpassId).populate({
      path: 'student',
      populate: {
        path: 'class',
        populate: [
          { path: 'mentors' }, // Populates the mentors array
          { 
            path: 'department', 
            populate: { path: 'hod' } // Populates the HOD inside the department
          } 
        ]
      }
    });

    if (!outpass || !outpass.student || !outpass.student.class) return;

    const student = outpass.student;
    const mentors = student.class.mentors || [];
    const hod = student.class.department?.hod;

    // 2. Send email to all Mentors
    for (const mentor of mentors) {
      if (mentor && mentor.email) {
        await sendAutoApprovalAcknowledgmentEmail(mentor, student, outpass);
      }
    }

    // 3. Send email to the HOD
    if (hod && hod.email) {
      await sendAutoApprovalAcknowledgmentEmail(hod, student, outpass);
    }

  } catch (error) {
    console.error("Failed to notify Mentor/HOD of auto-approval:", error);
  }
};