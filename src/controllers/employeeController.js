// src/controllers/employeeController.js

import asyncHandler from 'express-async-handler';
import Employee from '../models/Employee.js';

/**
 * @desc    Get employee profile
 * @route   GET /api/employee/profile
 * @access  Private (Employee)
 */
export const getEmployeeProfile = asyncHandler(async (req, res) => {
  // Find the employee by ID from the `req.user` object attached by the middleware
  const employee = await Employee.findById(req.user.id).select('-password');

  if (employee) {
    res.status(200).json(employee);
  } else {
    res.status(404);
    throw new Error('Employee not found');
  }
});
