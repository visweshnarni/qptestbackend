import dotenv from 'dotenv';
dotenv.config(); // ✅ Load environment variables early

import { Agenda } from 'agenda';
import mongoose from 'mongoose';
import Outpass from '../models/Outpass.js';
import Employee from '../models/Employee.js';
import Student from '../models/Student.js';
import { sendNotificationEmail } from '../utils/emailService.js';
import { makeNotificationCall } from '../utils/twilioService.js';

// Get the MongoDB connection string from your .env
const mongoConnectionString = process.env.MONGO_URI;

if (!mongoConnectionString) {
  console.error("❌ MONGO_URI is undefined! Check your .env file path or dotenv config.");
  process.exit(1);
}

// Initialize Agenda
const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: 'agendaJobs' },
});

/**
 * Define the "check outpass status" job
 */
agenda.define('check outpass status', async (job) => {
  const { outpassId } = job.attrs.data;
  console.log(`JOB RUNNING: Checking status for outpass ${outpassId}`);

  try {
    const outpass = await Outpass.findById(outpassId);

    if (!outpass) {
      console.log(`JOB CANCELED: Outpass ${outpassId} not found (maybe deleted).`);
      return;
    }

    // 1. Check if the outpass is still pending faculty approval
    if (outpass.status === 'pending_faculty') {
      console.log(`JOB ACTION: Outpass ${outpassId} is still pending. Re-notifying...`);

      // 2. Find the faculty who were notified
      const facultyToNotify = await Employee.find({
        _id: { $in: outpass.notifiedFaculty }
      }).select('name email phone');

      const student = await Student.findById(outpass.student).select('name');
      
      // 3. Re-send all notifications
      facultyToNotify.forEach(faculty => {
        console.log(`Re-notifying ${faculty.name}`);
        sendNotificationEmail(faculty, student, outpass);
        makeNotificationCall(faculty.phone);
      });

    } else {
      console.log(`JOB COMPLETE: Outpass ${outpassId} has been actioned. Status: ${outpass.status}`);
    }
  } catch (error) {
    console.error(`Error in 'check outpass status' job for ${outpassId}:`, error);
  }
});

export default agenda;
