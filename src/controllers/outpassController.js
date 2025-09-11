// src/controllers/outpassController.js

import asyncHandler from 'express-async-handler';
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';

/**
 * @desc    Student applies for a new outpass
 * @route   POST /api/outpass/apply
 * @access  Private (Student)
 */
export const applyOutpass = asyncHandler(async (req, res) => {
  const { reason, dateFrom, dateTo } = req.body;
  const studentId = req.user.id;

  // Create a new outpass document with the student's ID and initial status
  const outpass = await Outpass.create({
    studentId,
    reason,
    dateFrom,
    dateTo,
    status: 'pending_faculty', // Initial status for faculty approval
  });

  res.status(201).json(outpass);
});

/**
 * @desc    Get all outpasses for the logged-in student
 * @route   GET /api/outpass/mine
 * @access  Private (Student)
 */
export const getStudentOutpasses = asyncHandler(async (req, res) => {
  const studentId = req.user.id;

  // Find all outpass documents for the student and populate student details
  const outpasses = await Outpass.find({ studentId })
    .populate('studentId', 'name rollNumber')
    .sort({ createdAt: -1 });

  res.status(200).json(outpasses);
});

/**
 * @desc    Get pending outpass requests for the logged-in employee's role
 * @route   GET /api/outpass/pending
 * @access  Private (Employee)
 */
export const getPendingOutpasses = asyncHandler(async (req, res) => {
  const employeeRole = req.user.role;
  const employee = await Employee.findById(req.user.id);

  if (!employee) {
    res.status(404);
    throw new Error('Employee not found');
  }

  let pendingOutpasses = [];

  // Logic to fetch outpasses based on the employee's role
  if (employeeRole === 'faculty' || employeeRole === 'mentor' || employeeRole === 'protocol_officer') {
    pendingOutpasses = await Outpass.find({
      status: 'pending_faculty',
    })
      // CORRECTED: Added 'parentPhone' and 'parentName' to the populate query
      .populate('studentId', 'name rollNumber department parentPhone parentName');

    // Filter by department on the server-side to ensure security
    const filteredOutpasses = pendingOutpasses.filter(
      (outpass) => outpass.studentId.department === employee.department
    );

    res.status(200).json(filteredOutpasses);
  } else if (employeeRole === 'hod') {
    pendingOutpasses = await Outpass.find({
      status: 'pending_hod',
      'facultyApproval.status': 'approved',
    })
      // CORRECTED: Added 'parentPhone' and 'parentName' to the populate query
      .populate('studentId', 'name rollNumber department parentPhone parentName');

    // Filter by department on the server-side
    const filteredOutpasses = pendingOutpasses.filter(
      (outpass) => outpass.studentId.department === employee.department
    );

    res.status(200).json(filteredOutpasses);
  } else {
    res.status(200).json([]); // No pending outpasses for other roles
  }
});

/**
 * @desc    Faculty approves/rejects an outpass
 * @route   PUT /api/outpass/:id/faculty-approve
 * @access  Private (Faculty)
 */
export const facultyApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' or 'rejected'

  const outpass = await Outpass.findById(id);

  if (!outpass) {
    res.status(404);
    throw new Error('Outpass not found');
  }

  // A faculty can only approve if the status is pending faculty
  if (outpass.status !== 'pending_faculty') {
    res.status(400);
    throw new Error('Outpass cannot be approved by faculty at this stage');
  }

  // Update the faculty approval status and timestamp
  outpass.facultyApproval = { status, timestamp: new Date() };
  outpass.updatedAt = new Date();

  // Set the next status based on faculty's decision
  if (status === 'approved') {
    outpass.status = 'pending_hod';
  } else if (status === 'rejected') {
    outpass.status = 'rejected';
  }

  await outpass.save();
  res.status(200).json(outpass);
});

/**
 * @desc    HOD approves/rejects an outpass
 * @route   PUT /api/outpass/:id/hod-approve
 * @access  Private (HOD)
 */
export const hodApprove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'approved' or 'rejected'

  const outpass = await Outpass.findById(id);

  if (!outpass) {
    res.status(404);
    throw new Error('Outpass not found');
  }

  // An HOD can only approve if the status is pending HOD
  if (outpass.status !== 'pending_hod') {
    res.status(400);
    throw new Error('Outpass cannot be approved by HOD at this stage');
  }

  // Update the HOD approval status and timestamp
  outpass.hodApproval = { status, timestamp: new Date() };
  outpass.updatedAt = new Date();

  // Set the final status based on HOD's decision
  if (status === 'approved') {
    outpass.status = 'approved';
  } else if (status === 'rejected') {
    outpass.status = 'rejected';
  }

  await outpass.save();
  res.status(200).json(outpass);
});