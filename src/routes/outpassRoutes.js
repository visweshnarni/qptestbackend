// src/routes/outpassRoutes.js

import express from 'express';
import { applyOutpass, getStudentOutpasses, getPendingOutpasses, facultyApprove, hodApprove } from '../controllers/outpassController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// STUDENT ROUTES

// @route   POST /api/outpass/apply
// @desc    Student applies for a new outpass
// @access  Private (Student)
router.post('/apply', protect, authorize('student'), applyOutpass);

// @route   GET /api/outpass/mine
// @desc    Get all outpasses for the logged-in student
// @access  Private (Student)
router.get('/mine', protect, authorize('student'), getStudentOutpasses);

// EMPLOYEE ROUTES

// @route   GET /api/outpass/pending
// @desc    Get pending outpass requests for the logged-in employee's role
// @access  Private (Employee)
// This route will show pending outpasses relevant to the employee's department and role.
router.get('/pending', protect, authorize('faculty', 'hod', 'mentor', 'protocol_officer'), getPendingOutpasses);

// @route   PUT /api/outpass/:id/faculty-approve
// @desc    Faculty approves/rejects an outpass
// @access  Private (Faculty)
router.put('/:id/faculty-approve', protect, authorize('faculty','mentor'), facultyApprove);

// @route   PUT /api/outpass/:id/hod-approve
// @desc    HOD approves/rejects an outpass
// @access  Private (HOD)
router.put('/:id/hod-approve', protect, authorize('hod'), hodApprove);

export default router;
