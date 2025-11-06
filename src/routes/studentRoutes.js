// src/routes/studentRoutes.js

import express from 'express';
import {
  getStudentProfile,
 
} from '../controllers/studentController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// @route   GET /api/student/profile
// @desc    Get the profile of the logged-in student
// @access  Private (Student)
// 
router.get('/profile', protect, authorize('student'), getStudentProfile);

// @route   GET /api/student/:id
// @desc    Get a specific student's profile by ID
// @access  Private (Admin, HOD, Faculty)


export default router;