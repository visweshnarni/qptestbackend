import asyncHandler from 'express-async-handler';
import moment from 'moment-timezone'; // For time validation
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js'; // UPDATED: Fixed import path
import Employee from '../models/Employee.js';
import uploadBufferToCloudinary from '../utils/uploadToCloudinary.js'; // UPDATED: Fixed import path

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