// src/controllers/studentController.js

import asyncHandler from 'express-async-handler';
import Student from '../models/Student.js';

/**
 * @desc    Get student profile
 * @route   GET /api/student/profile
 * @access  Private (Student)
 */
export const getStudentProfile = asyncHandler(async (req, res) => {
  // Find the student by ID from the `req.user` object attached by the middleware
  const student = await Student.findById(req.user.id).select('-password');

  if (student) {
    res.status(200).json(student);
  } else {
    res.status(404);
    throw new Error('Student not found');
  }
});
