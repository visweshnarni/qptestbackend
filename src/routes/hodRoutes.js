// In server.js or a new file like routes/twilioRoutes.js
import express from 'express';
import { getTwilioVoiceResponse } from '../utils/twilioService.js';
import { getHodDashboard } from '../controllers/hodController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';


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

export default router;
