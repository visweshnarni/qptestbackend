import dotenv from 'dotenv';
dotenv.config();

import { Agenda } from 'agenda';
import Outpass from '../models/Outpass.js';
import Employee from '../models/Employee.js';
import Student from '../models/Student.js';

import { sendNotificationEmail } from '../utils/emailService.js';
import { makeNotificationCall } from '../utils/twilioService.js';
import { notifyPendingHodRequests } from '../utils/hodNotification/hodNotificationService.js';

// Import your new Bulk Parent Retry Service
import { processBulkParentRetries } from '../services/parent/parentBulkRetryService.js';
import CollegeConfig from '../models/CollegeConfig.js';

const mongoConnectionString = process.env.MONGO_URI;

if (!mongoConnectionString) {
  console.error("❌ MONGO_URI is undefined! Check your .env file path or dotenv config.");
  process.exit(1);
}

// Sleep helper function to stagger calls
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize Agenda
const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: 'agendaJobs' },
});


// ---------------------------------------------------------------------
// 🔹 BULK PARENT RETRY SCHEDULER
// ---------------------------------------------------------------------
agenda.define('bulk retry parent verification', async () => {
  console.log('🔔 Running scheduled Bulk Parent Retry job...');
  try {
    await processBulkParentRetries();
  } catch (error) {
    console.error('❌ Error in bulk parent retry job:', error);
  }
});


// ---------------------------------------------------------------------
// 🔹 BULK FACULTY RE-NOTIFICATION SCHEDULER
// ---------------------------------------------------------------------
agenda.define('bulk retry faculty verification', async () => {
  console.log('🔔 Running scheduled Bulk Faculty re-notification job...');
  
  try {
    const pendingOutpasses = await Outpass.find({ status: 'pending_faculty' })
      .populate('student');

    if (pendingOutpasses.length === 0) {
      console.log("✅ No pending faculty verifications found.");
      return;
    }

    // Process all pending outpasses concurrently
    const retryPromises = pendingOutpasses.map(async (outpass) => {
      
      const facultyToNotify = await Employee.find({
        _id: { $in: outpass.notifiedFaculty },
      }).select('name email phone');

      // Call faculties ONE-BY-ONE for this specific outpass
      for (const faculty of facultyToNotify) {
        
        // Fresh DB check before calling
        const checkOutpass = await Outpass.findById(outpass._id);
        
        // Define terminal states that mean we should stop notifying faculties
        const terminalStates = [
          "pending_hod", 
          "approved", 
          "rejected", 
          "cancelled_by_student", 
          "exited"
        ];

        // If it doesn't exist, hit a terminal state, or is simply no longer pending_faculty
        if (!checkOutpass || terminalStates.includes(checkOutpass.status) || checkOutpass.status !== 'pending_faculty') {
          console.log(`✅ Outpass ${outpass._id} escalated/resolved (Status: ${checkOutpass?.status}). Breaking faculty retry loop.`);
          break; // Stop notifying other faculties!
        }

        console.log(`📩 Re-notifying faculty: ${faculty.name} for outpass ${outpass._id}`);
        try {
          // Fire email and call
          await sendNotificationEmail(faculty, outpass.student, checkOutpass);
          await makeNotificationCall(faculty.phone);
        } catch (err) {
          console.error(`❌ Failed to notify faculty ${faculty.name}:`, err.message);
        }

        // Wait 45 seconds for this faculty to potentially open the dashboard and approve
        await sleep(45000); 
      }
    });

    await Promise.all(retryPromises);
    console.log('🏁 Bulk Faculty Retry Check Completed.');

  } catch (error) {
    console.error('❌ Error in bulk faculty retry job:', error);
  }
});
// ---------------------------------------------------------------------
// 🔹 HOD BULK RE-NOTIFICATION JOB
// ---------------------------------------------------------------------
agenda.define('notify pending hod requests', async () => {
  console.log('🔔 Running scheduled HOD re-notification job...');
  try {
    await notifyPendingHodRequests();
  } catch (error) {
    console.error('❌ Error in HOD re-notification job:', error);
  }
});


// ---------------------------------------------------------------------
// 🕒 Start Agenda & Schedule Jobs
// ---------------------------------------------------------------------
(async function () {
  await agenda.start();
  console.log('✅ Agenda job processor started.');

  // Clean up any old individual jobs from the database (optional, but good practice)
  await agenda.cancel({ name: "retry-parent-call" });
  await agenda.cancel({ name: "check outpass status" });

  // 1. Fetch the dynamic retry minutes from the database
  let parentRetryMinutes = 15; // Fallback default
  try {
    const config = await CollegeConfig.findOne();
    if (config && config.parentCallRetryMinutes) {
      parentRetryMinutes = config.parentCallRetryMinutes;
    }
  } catch (error) {
    console.error("⚠️ Could not fetch CollegeConfig for Agenda, using default 15 minutes.", error.message);
  }

  // 2. Schedule the bulk sweeps
  // Parent uses the dynamic DB value
  await agenda.every(`${parentRetryMinutes} minutes`, 'bulk retry parent verification');
  
  // Faculty and HOD continue to use standard 15 mins (or update these if you add DB fields for them too)
  await agenda.every('15 minutes', 'bulk retry faculty verification');
  await agenda.every('15 minutes', 'notify pending hod requests');

  console.log(`🕒 Parent bulk retry job scheduled every ${parentRetryMinutes} minutes (from DB config)`);
  console.log('🕒 Faculty & HOD bulk re-notification jobs scheduled every 15 minutes');

})();



export default agenda;