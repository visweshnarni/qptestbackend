// src/routes/adminRoutes.js

import express from 'express';
import { listAllUsers, listAllOutpasses } from '../controllers/adminController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// @route   GET /api/admin/users
// @desc    List all students and employees in the system
// @access  Private (Admin)
router.get('/users', protect, authorize('admin'), listAllUsers);

// @route   GET /api/admin/outpasses
// @desc    List all outpasses in the system
// @access  Private (Admin)
router.get('/outpasses', protect, authorize('admin'), listAllOutpasses);

export default router;
