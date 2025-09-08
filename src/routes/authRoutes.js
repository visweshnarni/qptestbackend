// src/routes/authRoutes.js

import express from 'express';
import { registerStudent, registerEmployee, loginUser } from '../controllers/authController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// @route   POST /api/auth/register/student
// @desc    Register a new student (Admin only)
// @access  Private (Admin)
// The 'protect' middleware ensures only logged-in users can access this route.
// The 'authorize' middleware then checks if the user's role is 'admin'.
router.post('/register/student', protect, authorize('admin'), registerStudent);

// @route   POST /api/auth/register/employee
// @desc    Register a new employee (Admin only)
// @access  Private (Admin)
// Same as above, this route is restricted to admins.
router.post('/register/employee', protect, authorize('admin'), registerEmployee);

// @route   POST /api/auth/login
// @desc    Authenticate user and get token
// @access  Public
router.post('/login', loginUser);

export default router;
