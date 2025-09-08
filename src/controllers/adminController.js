// src/controllers/adminController.js

import asyncHandler from 'express-async-handler';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import Outpass from '../models/Outpass.js';

/**
 * @desc    List all students & employees
 * @route   GET /api/admin/users
 * @access  Private (Admin)
 */
export const listAllUsers = asyncHandler(async (req, res) => {
  // Fetch all students, excluding their passwords
  const students = await Student.find().select('-password');
  // Fetch all employees, excluding their passwords
  const employees = await Employee.find().select('-password');

  // Combine the lists and return them in the response
  res.status(200).json({ students, employees });
});

/**
 * @desc    List all outpasses in system
 * @route   GET /api/admin/outpasses
 * @access  Private (Admin)
 */
export const listAllOutpasses = asyncHandler(async (req, res) => {
  // Find all outpasses and populate the 'studentId' with the student's name and roll number
  const outpasses = await Outpass.find({})
    .populate('studentId', 'name rollNumber')
    .sort({ createdAt: -1 });

  res.status(200).json(outpasses);
});
