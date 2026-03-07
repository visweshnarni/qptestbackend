import express from 'express';
import { protect, authorize } from '../middlewares/authMiddleware.js';
import { 
  scanQrAndExit, 
  searchOutpass, 
  markExited 
} from '../controllers/securityController.js';

const router = express.Router();

// All routes require login and the 'security' role
router.use(protect);
router.use(authorize('security'));

router.post('/scan-qr', scanQrAndExit);
router.get('/search-outpass', searchOutpass);
router.put('/mark-exited/:id', markExited);

export default router;