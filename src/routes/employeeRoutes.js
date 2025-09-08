// src/routes/employeeRoutes.js

import express from 'express';
import { getEmployeeProfile } from '../controllers/employeeController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// @route   GET /api/employee/profile
// @desc    Get the profile of the logged-in employee
// @access  Private (Employee)
// This route is protected and accessible to all employee roles.
router.get('/profile', protect, authorize('faculty', 'hod', 'mentor', 'protocol_officer'), getEmployeeProfile);

export default router;
