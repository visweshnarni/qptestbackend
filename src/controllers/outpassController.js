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


/**
 * @desc    Student applies for a new outpass
 * @route   POST /api/outpass/apply
 * @access  Private (Student)
 */
export const applyOutpass = asyncHandler(async (req, res) => {
  // --- 1. Time Validation ---
  const now = moment().tz('Asia/Kolkata'); 
  const hour = now.hour();

  // // Validate college timings (8 AM to 4 PM)
  // if (hour < 8 || hour >= 16) {
  //   res.status(400);
  //   throw new Error('Outpass can only be applied for during college hours (8:00 AM - 4:00 PM).');
  // }

  // --- 2. Get Form Data ---
  const {
    reasonCategory,
    reason,
    dateOfExit,    // e.g., "2025-11-07"
    timeOfExit,    // e.g., "1:30 PM"
    timeOfReturn,  // <-- MODIFIED: Get the return time from the body
    alternateContact,
  } = req.body;
  const studentId = req.user.id; // From 'protect' middleware

  // <-- MODIFIED: Added timeOfReturn to the check
  if (!reasonCategory || !reason || !dateOfExit || !timeOfExit || !timeOfReturn) {
    res.status(400);
    throw new Error('Please fill all required fields, including exit and return times.');
  }

  // --- 3. "Today Only" Validation ---
  const todayString = now.format('YYYY-MM-DD');
  if (dateOfExit !== todayString) {
    res.status(400);
    throw new Error('Outpass can only be applied for the current day. You cannot apply for a future date.');
  }

  // --- 4. Get Student Attendance ---
  const student = await Student.findById(studentId).select('name attendancePercentage');
  if (!student) {
    res.status(404);
    throw new Error('Student profile not found.');
  }

  // --- 5. Handle File Upload (if one exists) ---
  let supportingDocumentUrl = null;
  if (req.file) {
    try {
      supportingDocumentUrl = await uploadBufferToCloudinary(
        req.file.buffer,
        student.name,
        req.file.originalname
      );
    } catch (uploadError) {
      console.error(uploadError);
      res.status(500);
      throw new Error('Failed to upload supporting document.');
    }
  }

  // --- 6. Calculate Timestamps from 12-hr Format ---

  // Combine date and 12-hr EXIT time string
  const combinedExitString = `${dateOfExit} ${timeOfExit}`;
  // Parse using the 12-hr format
  const dateFrom = moment.tz(combinedExitString, "YYYY-MM-DD h:mm A", 'Asia/Kolkata').toDate();

  // <-- MODIFIED: Calculate dateTo from timeOfReturn ---
  // Combine date and 12-hr RETURN time string
  const combinedReturnString = `${dateOfExit} ${timeOfReturn}`;
  // Parse using the 12-hr format
  const dateTo = moment.tz(combinedReturnString, "YYYY-MM-DD h:mm A", 'Asia/Kolkata').toDate();
  
  // --- MODIFIED: Improved Validation ---
  
  // Validate that exit time is not after return time
  if (moment(dateFrom).isAfter(dateTo)) {
    res.status(400);
    throw new Error('Exit time cannot be after the return time.');
  }

  // Get the end-of-college-day time (4:00 PM)
  const endOfCollege = moment.tz(`${dateOfExit}T16:00:00.000`, 'Asia/Kolkata');

  // Validate that return time is not after 4:00 PM
  if (moment(dateTo).isAfter(endOfCollege)) {
    res.status(400);
    throw new Error('Return time cannot be after 4:00 PM.');
  }
  
  // Validate that exit time is not after 4:00 PM
  if (moment(dateFrom).isAfter(endOfCollege)) {
    res.status(400);
    throw new Error('Exit time cannot be after 4:00 PM.');
  }

  // --- 7. Create and Save Outpass ---
  const outpass = await Outpass.create({
    student: studentId,
    reasonCategory,
    reason,
    dateFrom, // This is your "exit start time"
    dateTo,   // This is your "exit end time"
    alternateContact: alternateContact || undefined, // Avoid saving empty string
    supportingDocumentUrl,
    attendanceAtApply: student.attendancePercentage,
    status: 'pending_faculty',
  });

  // --- 8. NEW: Find Targets and Trigger Notifications ---
  
  // Get the full student object (needed for finder)
  const fullStudent = await Student.findById(studentId).populate('class');
  
  // Find who to notify
  const targets = await getNotificationTargets(fullStudent, outpass);

  if (targets.length > 0) {
    // Save who we are notifying
    outpass.notifiedFaculty = targets.map(t => t._id);
    await outpass.save();

    // Send notifications (async - don't wait for these to finish)
    targets.forEach(faculty => {
      sendNotificationEmail(faculty, fullStudent, outpass);
      makeNotificationCall(faculty.phone);
    });
  } else {
    console.warn(`No notification targets found for student ${student.name}.`);
    // You might want to email the HOD by default here
  }

  // --- 9. NEW: Schedule the 15-minute follow-up job ---
  // (We will create 'agenda' in the next step)
  try {
    const { agenda } = req.app.locals; // Get agenda from app instance
    await agenda.start();
    await agenda.schedule('in 15 minutes', 'check outpass status', { 
      outpassId: outpass._id.toString() 
    });
    console.log(`Scheduled 15-min check for outpass ${outpass._id}`);
  } catch (err) {
    console.error('Failed to schedule agenda job:', err);
  }

  // Send response back to student
  res.status(201).json(outpass);
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


