import dotenv from 'dotenv';
dotenv.config(); // ✅ Load environment variables early

import { Agenda } from 'agenda';
import Outpass from '../models/Outpass.js';
import Employee from '../models/Employee.js';
import Student from '../models/Student.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import { makeNotificationCall } from '../utils/twilioService.js';
import { notifyPendingHodRequests } from '../utils/hodNotification/hodNotificationService.js';

const mongoConnectionString = process.env.MONGO_URI;
if (!mongoConnectionString) {
  console.error("❌ MONGO_URI is undefined! Check your .env file path or dotenv config.");
  process.exit(1);
}

// Initialize Agenda
const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: 'agendaJobs' },
});

// ---------------------------------------------------------------------
// 🔹 FACULTY RE-NOTIFICATION JOB
// ---------------------------------------------------------------------
agenda.define('check outpass status', async (job) => {
  const { outpassId } = job.attrs.data;
  console.log(`🔍 JOB RUNNING: Checking status for outpass ${outpassId}`);

  try {
    const outpass = await Outpass.findById(outpassId);

    if (!outpass) {
      console.log(`❌ JOB CANCELED: Outpass ${outpassId} not found (maybe deleted).`);
      return;
    }

    // Still pending for faculty
    if (outpass.status === 'pending_faculty') {
      console.log(`🔁 JOB ACTION: Outpass ${outpassId} still pending. Re-notifying...`);

      const facultyToNotify = await Employee.find({
        _id: { $in: outpass.notifiedFaculty },
      }).select('name email phone');

      const student = await Student.findById(outpass.student).select('name');

      // Re-send notifications
      for (const faculty of facultyToNotify) {
        console.log(`📩 Re-notifying faculty: ${faculty.name}`);
        await sendNotificationEmail(faculty, student, outpass);
        await makeNotificationCall(faculty.phone);
      }
    } else {
      console.log(`✅ JOB COMPLETE: Outpass ${outpassId} processed. Status: ${outpass.status}`);
    }
  } catch (error) {
    console.error(`❌ Error in 'check outpass status' job for ${outpassId}:`, error);
  }
});

// ---------------------------------------------------------------------
// 🔹 HOD BULK RE-NOTIFICATION JOB (every 15 mins)
// ---------------------------------------------------------------------
agenda.define('notify pending hod requests', async () => {
  console.log('🔔 Running scheduled HOD re-notification job...');
  await notifyPendingHodRequests();
});

// ---------------------------------------------------------------------
// 🕒 Start Agenda & Schedule Jobs
// ---------------------------------------------------------------------
(async function () {
  await agenda.start();
  console.log('✅ Agenda job processor started.');

  // Repeat every 15 minutes for HOD reminders
  await agenda.every('15 minutes', 'notify pending hod requests');
  console.log('🕒 HOD re-notification job scheduled every 15 minutes');
})();

export default agenda;
