import asyncHandler from 'express-async-handler';
import moment from 'moment-timezone'; // For time validation
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js'; // UPDATED: Fixed import path
import Employee from '../models/Employee.js';
import uploadBufferToCloudinary from '../utils/uploadToCloudinary.js'; // UPDATED: Fixed import path
// ... all your other controller functions ...
import { getTwilioVoiceResponse as twilioResponse } from '../utils/twilioService.js';
// ... all your other imports
import { sendNotificationEmail } from '../utils/emailService.js';
import { makeNotificationCall } from '../utils/twilioService.js';
import { getNotificationTargets } from '../utils/notificationFinder.js';
import axios from "axios";
import CollegeConfig from "../models/CollegeConfig.js";
import { validateOutpassWithML } from "../services/ml/mlValidationService.js";
import { initiateParentCalls } from "../services/parent/parentCallService.js";
import { notifyFacultyForOutpass } from "../services/faculty/facultyNotificationService.js";

// import CollegeConfig from "../models/CollegeConfig.js";

const getCollegeConfig = async () => {
  const config = await CollegeConfig.findOne();
  if (!config) {
    throw new Error("College configuration missing.");
  }
  return config;
};


const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a =
    Math.sin(Δφ/2) * Math.sin(Δφ/2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ/2) * Math.sin(Δλ/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

/**
 * @desc    Student applies for a new outpass
 * @route   POST /api/outpass/apply
 * @access  Private (Student)
 */
export const applyOutpass = asyncHandler(async (req, res) => {

  const now = moment().tz("Asia/Kolkata");

  const {
    reasonCategory,
    reason,
    dateOfExit,
    timeOfExit,
    timeOfReturn,
    alternateContact,
    latitude,
    longitude
  } = req.body;

  const studentId = req.user.id;

  if (!reasonCategory || !reason || !dateOfExit || !timeOfExit || !timeOfReturn) {
    throw new Error("Missing required fields");
  }

  /*
  ==========================
  1️⃣ TODAY VALIDATION
  ==========================
  */
  const todayString = now.format("YYYY-MM-DD");

  if (dateOfExit !== todayString) {
    throw new Error("Outpass must be applied for today only.");
  }

  /*
  ==========================
  2️⃣ STUDENT DATA
  ==========================
  */
  // Ensure we select 'class' so the populate actually works
  const student = await Student.findById(studentId)
    .populate("class")
    .select("name attendancePercentage primaryParentPhone secondaryParentPhone class");

  if (!student) {
    throw new Error("Student not found");
  }

  if (!student.class || !student.class.semesterStartDate || !student.class.semesterEndDate) {
    throw new Error("Student class or semester dates are not configured properly.");
  }

  /*
  ==========================
  3️⃣ COLLEGE CONFIG
  ==========================
  */
  const collegeConfig = await getCollegeConfig();

  const distance = calculateDistanceMeters(
    latitude,
    longitude,
    collegeConfig.location.latitude,
    collegeConfig.location.longitude
  );

  if (distance > collegeConfig.allowedRadiusMeters) {
    throw new Error("You must apply from within college campus.");
  }

  /*
  ==========================
  4️⃣ FILE UPLOAD
  ==========================
  */
  let supportingDocumentUrl = null;

  if (req.file) {
    supportingDocumentUrl = await uploadBufferToCloudinary(
      req.file.buffer,
      student.name,
      req.file.originalname
    );
  }

  /*
  ==========================
  5️⃣ TIME CALCULATIONS
  ==========================
  */
  const combinedExitString = `${dateOfExit} ${timeOfExit}`;
  const combinedReturnString = `${dateOfExit} ${timeOfReturn}`;

  const dateFrom = moment
    .tz(combinedExitString, "YYYY-MM-DD h:mm A", "Asia/Kolkata")
    .toDate();

  const dateTo = moment
    .tz(combinedReturnString, "YYYY-MM-DD h:mm A", "Asia/Kolkata")
    .toDate();

  if (moment(dateFrom).isAfter(dateTo)) {
    throw new Error("Exit time cannot be after return time");
  }

  /*
  ==========================
  6️⃣ ML PREPROCESSING
  ==========================
  */

  // --- A. Attendance Attainable Logic ---
  const semesterStart = moment(student.class.semesterStartDate).tz("Asia/Kolkata");
  const semesterEnd = moment(student.class.semesterEndDate).tz("Asia/Kolkata");
  
  const totalDaysInSemester = semesterEnd.diff(semesterStart, "days");
  const daysPassedSoFar = now.diff(semesterStart, "days");
  const daysRemaining = semesterEnd.diff(now, "days");

 // Keep the raw percentage for the math calculations below
  const raw_attendance_pct = student.attendancePercentage;
  
  // Convert to BINARY for the ML API
  const attendance_pct = raw_attendance_pct >= 75 ? 1 : 0;
  let attendance_attainable = 0;

  if (totalDaysInSemester > 0) {
    // Prevent negative days if semester hasn't started yet
    const validPassedDays = Math.max(0, daysPassedSoFar);
    const validRemainingDays = Math.max(0, daysRemaining);

    // 🔴 FIXED: Use raw_attendance_pct here!
    // Days they actually attended so far
    const daysAttendedSoFar = (raw_attendance_pct / 100) * validPassedDays;

    // Assuming they attend EVERY remaining day
    const maxPossibleAttendedDays = daysAttendedSoFar + validRemainingDays;

    // What would their final percentage be?
    const maxPossiblePercentage = (maxPossibleAttendedDays / totalDaysInSemester) * 100;

    attendance_attainable = maxPossiblePercentage >= 75 ? 1 : 0;
    console.log("Max Possible:", maxPossiblePercentage, "Attainable:", attendance_attainable);
  } else {
    // Fallback if dates are improperly configured
    attendance_attainable = raw_attendance_pct >= 75 ? 1 : 0;
  }

  // --- B. Past Outpasses Logic ---
  const pastMonth = moment().subtract(30, "days").toDate();

  // Only count outpasses that were approved or physically exited
  const pastOutpassesCount = await Outpass.countDocuments({
    student: studentId,
    status: { $in: ["approved", "exited"] },
    createdAt: { $gte: pastMonth }
  });

  const past_outpasses_gt3 = pastOutpassesCount > 3 ? 1 : 0;

  // --- C. Category Flags ---
  const is_emergency = reasonCategory === "Emergency" ? 1 : 0;
  const religious_exception = reasonCategory === "Religious" ? 1 : 0;

  /*
  ==========================
  7️⃣ ML VALIDATION
  ==========================
  */
  const mlResult = await validateOutpassWithML({
    attendance_pct,
    attendance_attainable,
    past_outpasses_gt3,
    is_emergency,
    religious_exception,
    reason,
    reason_category: reasonCategory,
    document_url: supportingDocumentUrl
  });

  const mlDecision = mlResult.decision;

  /*
  ==========================
  8️⃣ REJECT CASE
  ==========================
  */
  if (mlDecision === "REJECT") {
    const outpass = await Outpass.create({
      student: studentId,
      reasonCategory,
      reason,
      dateFrom,
      dateTo,
      alternateContact,
      supportingDocumentUrl,
      attendanceAtApply: student.attendancePercentage,
      status: "rejected",
      mlDecision,
      mlExplanation: mlResult.explanation,
      mlFeatures: mlResult.features_used
    });

    return res.status(200).json({
      message: "Outpass rejected automatically",
      reason: mlResult.explanation
    });
  }

  /*
  ==========================
  9️⃣ CREATE OUTPASS
  ==========================
  */
  const outpass = await Outpass.create({
    student: studentId,
    reasonCategory,
    reason,
    dateFrom,
    dateTo,
    alternateContact,
    supportingDocumentUrl,
    attendanceAtApply: student.attendancePercentage,

    mlDecision,
    mlExplanation: mlResult.explanation,
    mlFeatures: mlResult.features_used,

    status:
      mlDecision === "AUTO_APPROVE"
        ? "pending_parent"
        : "pending_faculty"
  });

  /*
  ==========================
  🔟 SETUP TARGETS & SAVE
  ==========================
  */
  const callTargets = [];
  if (student.primaryParentPhone) callTargets.push({ phone: student.primaryParentPhone });
  if (student.secondaryParentPhone) callTargets.push({ phone: student.secondaryParentPhone });

  outpass.parentVerification = {
    status: "pending",
    callTargets,
    callAttempts: 1,
    lastCallAt: new Date()
  };
  await outpass.save();

  /*
  ==========================
  11️⃣ TRIGGER NOTIFICATIONS
  ==========================
  */
  // Fire and forget
  initiateParentCalls(callTargets, outpass._id).catch(console.error);
  notifyFacultyForOutpass(student, outpass).catch(console.error);

  /*
  ==========================
  RESPONSE
  ==========================
  */
  res.status(201).json({
    message: "Outpass request submitted",
    status: outpass.status,
    mlDecision
  });

});
/**
 * @desc    Get all outpasses for the logged-in student
 * @route   GET /api/outpass/mine
 * @access  Private (Student)
 */
export const getStudentOutpasses = asyncHandler(async (req, res) => {
  // Find all outpasses for the student, newest first
  const outpasses = await Outpass.find({ student: req.user.id })
    .sort({ createdAt: -1 });

  res.status(200).json(outpasses);
});

/**
 * @desc    Get pending outpass requests for the logged-in employee's role
 * @route   GET /api/outpass/pending
 * @access  Private (Faculty, HOD)
 */
export const getPendingOutpasses = asyncHandler(async (req, res) => {
  // Get employee role and department from the user object (attached by 'protect' middleware)
  const { role, department: employeeDeptId } = req.user;

  let query = {};
  if (role === 'faculty') {
    query.status = 'pending_faculty';
  } else if (role === 'hod') {
    query.status = 'pending_hod';
  } else {
    return res.status(200).json([]); // Other roles see no pending requests
  }

  // Find all outpasses matching the status
  const outpasses = await Outpass.find(query)
    .populate({
      path: 'student',
      select: 'name rollNumber class primaryParentPhone parentName',
      populate: {
        path: 'class',
        select: 'name department',
        populate: {
          path: 'department',
          select: 'name',
        },
      },
    })
    .sort({ createdAt: 1 }); // Show oldest requests first

  // Server-side filter to ensure employees only see students in their department
  const filteredOutpasses = outpasses.filter(outpass => {
    if (!outpass.student || !outpass.student.class || !outpass.student.class.department) {
      return false; // Skip if data is incomplete
    }
    // Check if the student's department ID matches the employee's department ID
    return outpass.student.class.department._id.equals(employeeDeptId);
  });

  res.status(200).json(filteredOutpasses);
});

/**
 * @desc    Faculty approves/rejects an outpass
 * @route   PUT /api/outpass/:id/faculty-approve
 * @access  Private (Faculty)
 */
export const facultyApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body; // 'approved' or 'rejected'
  const facultyId = req.user.id;

  if (!status) {
    res.status(400);
    throw new Error('Approval status is required.');
  }

  const outpass = await Outpass.findById(id);

  if (!outpass) {
    res.status(404);
    throw new Error('Outpass not found');
  }

  if (outpass.status !== 'pending_faculty') {
    res.status(400);
    throw new Error('Outpass is not pending faculty approval.');
  }

  // Track who approved it
  outpass.facultyApprover = facultyId;

  if (status === 'approved') {
    outpass.status = 'pending_hod';
    // By approving, the faculty is verifying parent contact
    outpass.parentContactVerified = {
      status: true,
      by: facultyId,
      at: new Date(),
    };
  } else {
    outpass.status = 'rejected';
    outpass.rejectionReason = rejectionReason || 'Rejected by faculty';
  }

  const updatedOutpass = await outpass.save();
  res.status(200).json(updatedOutpass);
});

/**
 * @desc    HOD approves/rejects an outpass
 * @route   PUT /api/outpass/:id/hod-approve
 * @access  Private (HOD)
 */
export const hodApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body; // 'approved' or 'rejected'
  const hodId = req.user.id;

  const outpass = await Outpass.findById(id);

  if (!outpass) {
    res.status(44);
    throw new Error('Outpass not found');
  }

  if (outpass.status !== 'pending_hod') {
    res.status(400);
    throw new Error('Outpass is not pending HOD approval.');
  }

  // Track who approved it
  outpass.hodApprover = hodId;

  if (status === 'approved') {
    outpass.status = 'approved';
  } else {
    outpass.status = 'rejected';
    outpass.rejectionReason = rejectionReason || 'Rejected by HOD';
  }

  const updatedOutpass = await outpass.save();
  res.status(200).json(updatedOutpass);
});


/**
 * @desc    Provides TwiML for Twilio callback
 * @route   POST /api/outpass/twilio-callback
 * @access  Public
 */
export const getTwilioVoiceResponse = () => {
  // This just passes the call to the service
  return twilioResponse();
};


/**
 * @desc    Get the currently processing or approved outpass for a student
 * @route   GET /api/outpass/current
 * @access  Private (Student)
 */
export const getCurrentOutpass = asyncHandler(async (req, res) => {
  const studentId = req.user.id;

  // Find latest outpass still in progress (approved but not exited)
  const outpass = await Outpass.findOne({
    student: studentId,
    status: { $in: ['pending_faculty', 'pending_hod', 'approved'] },
  })
    .populate({
      path: 'student',
      populate: {
        path: 'class',
        populate: {
          path: 'department',
          select: 'name hod',
          populate: { path: 'hod', select: 'name email phone' },
        },
      },
    })
    .populate('facultyApprover', 'name email phone')
    .populate('hodApprover', 'name email phone')
    .populate('assignedMentor', 'name email phone')
    .populate('notifiedFaculty', 'name email phone')
    .sort({ createdAt: -1 });

  if (!outpass) {
    return res.status(404).json({ message: 'No active outpass found.' });
  }

  const student = outpass.student;

  // --- Fetch mentors ---
  let mentors = [];
  if (student?.class?._id) {
    const Class = (await import('../models/Class.js')).default;
    const classData = await Class.findById(student.class._id)
      .populate('mentors', 'name email phone');
    mentors = classData?.mentors || [];
  }

  // --- Fetch HOD ---
  let hod = null;
  if (student?.class?.department?.hod) {
    hod = {
      name: student.class.department.hod.name,
      email: student.class.department.hod.email,
      phone: student.class.department.hod.phone,
    };
  }

  // --- Build response ---
  const response = {
    requestId: outpass._id,
    status: outpass.status,
    reasonCategory: outpass.reasonCategory,
    reason: outpass.reason,
    dateFrom: outpass.dateFrom,
    dateTo: outpass.dateTo,
    exitTime: moment(outpass.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(outpass.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    actualExitTime: outpass.actualExitTime
      ? moment(outpass.actualExitTime).tz('Asia/Kolkata').format('h:mm A')
      : null,
    supportingDocumentUrl: outpass.supportingDocumentUrl,

    facultyApprover: outpass.facultyApprover
      ? { name: outpass.facultyApprover.name, email: outpass.facultyApprover.email }
      : null,
    hodApprover: outpass.hodApprover
      ? { name: outpass.hodApprover.name, email: outpass.hodApprover.email }
      : null,
    assignedMentors: mentors.map(m => ({
      name: m.name,
      email: m.email,
      phone: m.phone,
    })),
    notifiedFaculty: outpass.notifiedFaculty.map(f => ({
      name: f.name,
      email: f.email,
      phone: f.phone,
    })),
    exitVerified: outpass.exitVerified,
    returnVerified: outpass.returnVerified,

    statusUpdates: [
      { time: outpass.createdAt, message: 'Outpass application submitted successfully and faculty notified.' },
      ...(outpass.status === 'pending_hod'
        ? [{ time: outpass.updatedAt, message: 'Faculty approved. Awaiting HOD approval.' }]
        : []),
      ...(outpass.status === 'approved'
        ? [{ time: outpass.updatedAt, message: 'HOD approved. Ready for security verification.' }]
        : []),
      ...(outpass.status === 'exited'
        ? [{ time: outpass.actualExitTime, message: 'Student exited campus. Verified by security.' }]
        : []),
      ...(outpass.status === 'rejected'
        ? [{ time: outpass.updatedAt, message: `Outpass rejected. Reason: ${outpass.rejectionReason || 'N/A'}` }]
        : []),
      ...(outpass.status === 'cancelled_by_student'
        ? [{ time: outpass.updatedAt, message: 'Outpass cancelled by student.' }]
        : []),
    ],
  };

  res.status(200).json(response);
});


/**
 * @desc    Cancel an outpass by student
 * @route   PUT /api/outpass/:id/cancel
 * @access  Private (Student)
 */
export const cancelOutpassByStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = req.user.id;

  const outpass = await Outpass.findById(id);

  if (!outpass) {
    res.status(404);
    throw new Error('Outpass not found');
  }

  if (outpass.student.toString() !== studentId.toString()) {
    res.status(403);
    throw new Error('You are not authorized to cancel this outpass.');
  }

  if (['approved', 'rejected', 'cancelled_by_student'].includes(outpass.status)) {
    res.status(400);
    throw new Error('This outpass can no longer be cancelled.');
  }

  outpass.status = 'cancelled_by_student';
  await outpass.save();

  res.status(200).json({ message: 'Outpass cancelled successfully.', outpass });
});


/**
 * @desc    Get student's outpass history (excluding currently processing ones)
 * @route   GET /api/outpass/history
 * @access  Private (Student)
 */
export const getOutpassHistory = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const { status, month, year, sort } = req.query;

  // 🔹 Base filter (exclude active pending)
  const query = {
    student: studentId,
    status: { $nin: ['pending_faculty', 'pending_hod'] },
  };

  // 🔹 Status filtering
  if (status && status !== "all") {
    if (status === "cancelled") query.status = "cancelled_by_student";
    else if (["approved", "rejected"].includes(status)) {
      query.status = status;
    }
  }

  // 🔹 Month/year filtering
  if (month || year) {
    const targetYear = year || moment().year();
    const targetMonth = month ? parseInt(month, 10) - 1 : 0;
    const startDate = moment.tz({ year: targetYear, month: targetMonth, day: 1 }, 'Asia/Kolkata').startOf('month').toDate();
    const endDate = moment(startDate).endOf('month').toDate();
    query.createdAt = { $gte: startDate, $lte: endDate };
  }

  // 🔹 Sorting
  const sortOrder = sort === "oldest" ? 1 : -1;

  const outpasses = await Outpass.find(query)
    .sort({ createdAt: sortOrder })
    .populate('facultyApprover', 'name')
    .populate('hodApprover', 'name')
    .populate('assignedMentor', 'name');

  // 🔹 Count summary (excluding pending)
  const [total, approved, rejected, cancelled] = await Promise.all([
    Outpass.countDocuments({ student: studentId, status: { $nin: ['pending_faculty', 'pending_hod'] } }),
    Outpass.countDocuments({ student: studentId, status: 'approved' }),
    Outpass.countDocuments({ student: studentId, status: 'rejected' }),
    Outpass.countDocuments({ student: studentId, status: 'cancelled_by_student' }),
  ]);

  // 🔹 Format response list
  const list = outpasses.map(o => ({
    requestId: o._id,
    reasonCategory: o.reasonCategory,
    reason: o.reason,
    status: o.status === "cancelled_by_student" ? "cancelled" : o.status,
    exitTime: moment(o.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(o.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    supportingDocumentUrl: o.supportingDocumentUrl || null,
    requestedAt: moment(o.createdAt).tz('Asia/Kolkata').format('MMM D, YYYY, hh:mm A'),
    lastUpdatedAt: moment(o.updatedAt).tz('Asia/Kolkata').format('MMM D, YYYY, hh:mm A'),
  }));

  res.status(200).json({
    summary: {
      total,
      approved,
      rejected,
      cancelled,
    },
    count: list.length,
    outpasses: list,
  });
});


