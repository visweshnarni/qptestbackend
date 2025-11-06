// src/controllers/studentController.js

import asyncHandler from 'express-async-handler';
import Student from '../models/Student.js';
import Outpass from '../models/Outpass.js';
import Class from '../models/Class.js'; // Import related models
import Department from '../models/Department.js'; // Import related models

/**
 * @desc    Get student profile, current outpass, and recent activity
 * @route   GET /api/student/profile
 * @access  Private (Student)
 */
export const getStudentProfile = asyncHandler(async (req, res) => {
  // We'll run 3 queries in parallel for efficiency
  
  // 1. Get Student Profile
  // We populate 'class' and then the 'department' *within* 'class'
  const studentProfileQuery = Student.findById(req.user.id)
    .select('-password')
    .populate({
      path: 'class',
      populate: {
        path: 'department',
        select: 'name', // We only need the department's name
      },
      select: 'name year department', // Select fields from Class
    });

  // 2. Get Current "Active" Outpass
  // Find one outpass that is not yet completed
  const currentOutpassQuery = Outpass.findOne({
    student: req.user.id,
    status: { $in: ['pending_faculty', 'pending_hod', 'approved'] },
  }).sort({ updatedAt: -1 }); // Get the most recent one

  // 3. Get Recent Activity (History)
  // Find the last 5 *completed* (approved or rejected) outpasses
  const recentActivityQuery = Outpass.find({
    student: req.user.id,
    status: { $in: ['approved', 'rejected'] },
  })
    .sort({ createdAt: -1 }) // Get the newest first
    .limit(5); // Only get the last 5

  // Run all queries
  const [student, currentOutpass, recentActivity] = await Promise.all([
    studentProfileQuery,
    currentOutpassQuery,
    recentActivityQuery,
  ]);

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // --- Normalize Data for Frontend ---
  // We create a new object that matches your `StudentProfile` interface exactly,
  // flattening the populated 'class' and 'department' data.
  const normalizedProfile = {
    _id: student._id,
    name: student.name,
    email: student.email,
    rollNumber: student.rollNumber,
    phone: student.phone,
    parentName: student.parentName,
    parentPhone: student.primaryParentPhone, // Matches frontend `parentPhone`
    parentPhone2: student.secondaryParentPhone, // Matches frontend `parentPhone2`
    attendancePercentage: student.attendancePercentage,
    
    // Flatten data from the populated 'class' object
    department: student.class?.department?.name || 'N/A',
    year: student.class?.year || 0,
    
    // Other fields your frontend interface expects
    profilePhoto: student.profilePhoto || undefined, // (if you add this to your model)
    isActive: student.isActive || true,          // (if you add this)
    dateOfBirth: student.dateOfBirth || undefined, // (if you add this)
    bloodGroup: student.bloodGroup || undefined,   // (if you- add this)
    address: student.address || undefined,       // (if you add this)
  };

  // Send the combined response
  res.status(200).json({
    profile: normalizedProfile,
    currentOutpass: currentOutpass || null, // Send the single object or null
    recentActivity: recentActivity,         // Send the array of recent passes
  });
});

/**
 * @desc    Get student details for the outpass application form
 * @route   GET /api/student/apply-details
 * @access  Private (Student)
 */
export const getStudentApplyDetails = asyncHandler(async (req, res) => {
  // req.user is attached by the 'protect' middleware
  const student = await Student.findById(req.user.id)
    .select('name rollNumber primaryParentPhone secondaryParentPhone class') // Added secondaryParentPhone
    .populate({
      path: 'class',
      select: 'name department',
      populate: {
        path: 'department',
        select: 'name',
      },
    });

  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Flatten the data to match the frontend screenshot
  const applyDetails = {
    name: student.name,
    collegeId: student.rollNumber,
    class: student.class.name,
    department: student.class.department.name,
    primaryParentContact: student.primaryParentPhone,
    alternateParentContact: student.secondaryParentPhone || null, // Added this field
  };

  res.status(200).json(applyDetails);
});