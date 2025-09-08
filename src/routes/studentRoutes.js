// src/routes/studentRoutes.js

import express from 'express';
import { getStudentProfile } from '../controllers/studentController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// @route   GET /api/student/profile
// @desc    Get the profile of the logged-in student
// @access  Private (Student)
// This route is protected and only accessible to users with the 'student' role.
router.get('/profile', protect, authorize('student'), getStudentProfile);

export default router;
