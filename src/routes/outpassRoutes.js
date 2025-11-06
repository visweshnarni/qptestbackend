// src/routes/outpassRoutes.js

import express from 'express';
import { applyOutpass, getStudentOutpasses, getPendingOutpasses, facultyApprove, hodApprove } from '../controllers/outpassController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import { upload } from '../utils/uploadToCloudinary.js'; // Import the upload middleware

const router = express.Router();

// STUDENT ROUTES

// @route   POST /api/outpass/apply
// @desc    Student applies for a new outpass
// @access  Private (Student)
// Use upload.single('fieldName') to catch the file.
// The 'fieldName' MUST match the name attribute in your HTML form
router.post(
  '/apply',
  protect,
  authorize('student'),
  upload.single('supportingDocument'), // This handles the multipart/form-data
  applyOutpass
);

// ... (rest of your routes are fine) ...
router.get('/mine', protect, authorize('student'), getStudentOutpasses);

// EMPLOYEE ROUTES
router.get('/pending', protect, authorize('faculty', 'hod'), getPendingOutpasses);
router.put('/:id/faculty-approve', protect, authorize('faculty'), facultyApprove);
router.put('/:id/hod-approve', protect, authorize('hod'), hodApprove);

export default router;