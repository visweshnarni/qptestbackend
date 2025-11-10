import {
  applyOutpass,
  getStudentOutpasses,
  getPendingOutpasses,
  facultyApprove,
  hodApprove,
  getCurrentOutpass,
  cancelOutpassByStudent
} from '../controllers/outpassController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import { upload } from '../utils/uploadToCloudinary.js';
import express from 'express';

const router = express.Router();

// Student routes
router.post(
  '/apply',
  protect,
  authorize('student'),
  upload.single('supportingDocument'),
  applyOutpass
);
router.get('/current', protect, authorize('student'), getCurrentOutpass);
router.put('/:id/cancel', protect, authorize('student'), cancelOutpassByStudent);
router.get('/mine', protect, authorize('student'), getStudentOutpasses);

// Employee routes
router.get('/pending', protect, authorize('faculty', 'hod'), getPendingOutpasses);
router.put('/:id/faculty-approve', protect, authorize('faculty'), facultyApprove);
router.put('/:id/hod-approve', protect, authorize('hod'), hodApprove);

export default router;
