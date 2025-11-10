// In server.js or a new file like routes/twilioRoutes.js
import express from 'express';
import { getTwilioVoiceResponse } from '../utils/twilioService.js';

const router = express.Router();

router.post('/outpass/hod-callback', (req, res) => {
  const twiml = getTwilioVoiceResponse();
  res.type('text/xml');
  res.send(twiml);
});

export default router;
