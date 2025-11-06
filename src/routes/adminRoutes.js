// src/routes/adminRoutes.js

import express from 'express';
import {
  listAllUsers,
  listAllOutpasses,
  createDepartment,
  getDepartments,
  updateDepartment,
  deleteDepartment,
  createClass,
  getClasses,
  updateClass,
  deleteClass,
  createTimetableSlot,
  getTimetableByClass,
  getTimetableByEmployee,
  deleteTimetableSlot
} from '../controllers/adminController.js';
import { protect, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes in this file are prefixed with /api/admin
// All routes require login (protect) and admin role (authorize)
router.use(protect, authorize('admin'));

// --- User & Outpass Routes ---
router.get('/users', listAllUsers);
router.get('/outpasses', listAllOutpasses);

// --- Department CRUD Routes ---
router
  .route('/departments')
  .post(createDepartment)
  .get(getDepartments);
  
router
  .route('/departments/:id')
  .put(updateDepartment)
  .delete(deleteDepartment);

// --- Class CRUD Routes ---
router
  .route('/classes')
  .post(createClass)
  .get(getClasses);
  
router
  .route('/classes/:id')
  .put(updateClass)
  .delete(deleteClass);

// --- Timetable CRUD Routes ---
router
  .route('/timetable')
  .post(createTimetableSlot);

router.delete('/timetable/:id', deleteTimetableSlot);

// Routes to view timetables by context
router.get('/timetable/class/:classId', getTimetableByClass);
router.get('/timetable/employee/:employeeId', getTimetableByEmployee);

export default router;