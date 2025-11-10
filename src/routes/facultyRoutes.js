import express from 'express';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import { getFacultyDashboard } from '../controllers/facultyController.js';

const router = express.Router();

/**
 * @route   GET /api/faculty/dashboard
 * @desc    Get dashboard data for faculty/mentor
 * @access  Private (Faculty, HOD)
 */
router.get('/dashboard', protect, authorize('faculty', 'hod'), getFacultyDashboard);

export default router;
