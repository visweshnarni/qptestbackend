// src/routes/studentRoutes.js

import express from 'express';
// Import BOTH controllers
import { getStudentProfile, getStudentApplyDetails } from '../controllers/studentController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Route for the main student dashboard
router.get('/profile', protect, authorize('student'), getStudentProfile);

// NEW: Route to populate the "Apply Outpass" form
router.get('/apply-details', protect, authorize('student'), getStudentApplyDetails);

export default router;