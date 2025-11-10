// In server.js or a new file like routes/twilioRoutes.js
import express from 'express';
import { getTwilioVoiceResponse } from '../utils/twilioService.js';
import { getHodDashboard } from '../controllers/hodController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import { getPendingHodApprovals, handleHodApproval } from '../controllers/hodController.js';


const router = express.Router();

router.post('/outpass/hod-callback', (req, res) => {
  const twiml = getTwilioVoiceResponse();
  res.type('text/xml');
  res.send(twiml);
});
/**
 * @route   GET /api/hod/dashboard
 * @desc    Get HOD dashboard data (department-level)
 * @access  Private (HOD)
 */
router.get('/dashboard', protect, authorize('hod'), getHodDashboard);
/**
 * @route   GET /api/hod/pending-approvals
 * @desc    List all pending outpass requests for HOD
 * @query   ?category=Emergency|Medical|Academic
 */
router.get('/pending-approvals', protect, authorize('hod'), getPendingHodApprovals);

/**
 * @route   PUT /api/hod/outpass/:id/action
 * @desc    Approve or reject an outpass by HOD
 */
router.put('/outpass/:id/action', protect, authorize('hod'), handleHodApproval);


export default router;
