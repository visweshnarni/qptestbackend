import express from 'express';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import {
  getFacultyDashboard,
  getPendingRequests,
  handleFacultyApproval,
} from '../controllers/facultyController.js';

const router = express.Router();

/**
 * @route   GET /api/faculty/dashboard
 * @desc    Dashboard for faculty/mentor
 * @access  Private (Faculty, HOD)
 */
router.get('/dashboard', protect, authorize('faculty', 'hod'), getFacultyDashboard);

/**
 * @route   GET /api/faculty/pending-requests
 * @desc    List all pending student outpass requests (with myclass or all filters)
 * @access  Private (Faculty, Mentor)
 */
router.get('/pending-requests', protect, authorize('faculty', 'hod'), getPendingRequests);

/**
 * @route   PUT /api/faculty/outpass/:id/action
 * @desc    Approve or reject a pending outpass
 * @access  Private (Faculty)
 */
router.put('/outpass/:id/action', protect, authorize('faculty', 'hod'), handleFacultyApproval);

export default router;
