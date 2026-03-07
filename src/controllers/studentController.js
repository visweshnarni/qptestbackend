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
  const studentProfileQuery = Student.findById(req.user.id)
    .select('-password')
    .populate({
      path: 'class',
      populate: {
        path: 'department',
        select: 'name', 
      },
      select: 'name year department', 
    });

  // 2. Get Current "Active" Outpass
  // Includes all pending states and 'approved' (ready for exit)
  const currentOutpassQuery = Outpass.findOne({
    student: req.user.id,
    status: { $in: ['pending_ml', 'pending_parent', 'pending_faculty', 'pending_hod', 'approved'] },
  })
  .populate('facultyApprover', 'name')
  .populate('hodApprover', 'name')
  .sort({ updatedAt: -1 }); 

  // 3. Get Recent Activity (History)
  // Includes all terminal states
  const recentActivityQuery = Outpass.find({
    student: req.user.id,
    status: { $in: ['exited', 'rejected', 'cancelled_by_student'] },
  })
    .populate('facultyApprover', 'name')
    .populate('hodApprover', 'name')
    .sort({ createdAt: -1 }) 
    .limit(5); 

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
  const normalizedProfile = {
    _id: student._id,
    name: student.name,
    email: student.email,
    rollNumber: student.rollNumber,
    phone: student.phone,
    parentName: student.parentName,
    parentPhone: student.primaryParentPhone, 
    parentPhone2: student.secondaryParentPhone, 
    attendancePercentage: student.attendancePercentage,
    
    // Flatten data from the populated 'class' object
    department: student.class?.department?.name || 'N/A',
    year: student.class?.year || 0,
    
    profilePhoto: student.profilePhoto || undefined, 
    isActive: student.isActive !== false, 
    dateOfBirth: student.dateOfBirth || undefined, 
    bloodGroup: student.bloodGroup || undefined,  
    address: student.address || undefined,       
  };

  // Helper function to format outpasses for the frontend interface
  const formatOutpass = (outpass) => {
    if (!outpass) return null;
    return {
      _id: outpass._id,
      status: outpass.status,
      reason: outpass.reason,
      dateFrom: outpass.dateFrom,
      dateTo: outpass.dateTo,
      // Map the approver references to the structure the frontend expects
      facultyApproval: outpass.facultyApprover ? { status: 'approved' } : undefined,
      hodApproval: outpass.hodApprover ? { status: 'approved' } : undefined,
      createdAt: outpass.createdAt,
    };
  };

  // Send the combined response
  res.status(200).json({
    profile: normalizedProfile,
    currentOutpass: formatOutpass(currentOutpass), 
    recentActivity: recentActivity.map(formatOutpass), 
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