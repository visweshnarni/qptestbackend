import express from 'express';
import { generateQrToken } from '../controllers/qrController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @route   POST /api/qr/generate
 * @desc    Generate a time-sensitive QR token for an approved outpass
 * @access  Private (Student only)
 */
router.post('/generate', protect, authorize('student'), generateQrToken);

export default router;