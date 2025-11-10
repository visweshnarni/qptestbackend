import express from 'express';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import {
  getFacultyDashboard,
  getPendingRequests,
  handleFacultyApproval,
  getStudentProfiles,
  getFacultyClasses,
  getFacultyHistory,
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
/**
 * @route   GET /api/faculty/student-profiles
 * @desc    Faculty can view or search student profiles
 * @access  Private (Faculty, HOD)
 */
router.get('/student-profiles', protect, authorize('faculty', 'hod'), getStudentProfiles);
/**
 * @route   GET /api/faculty/classes
 * @desc    Get all classes under faculty’s department (for dropdowns)
 * @access  Private (Faculty, HOD)
 */
router.get('/classes', protect, authorize('faculty', 'hod'), getFacultyClasses);
// History route
router.get('/history', protect, authorize('faculty', 'hod'), getFacultyHistory);
export default router;
