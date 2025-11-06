// controllers/authController.js

import asyncHandler from 'express-async-handler';
import Admin from '../models/Admin.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import generateToken from '../utils/generateToken.js';

/**
 * @desc    Register a new student
 * @route   POST /api/auth/register/student
 * @access  Private (Admin)
 */
export const registerStudent = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    rollNumber,
    phone,
    parentName,
    primaryParentPhone,
    secondaryParentPhone,
    class: classId, // Admin provides the Class ID
    attendancePercentage,
  } = req.body;

  // 1. Check if student already exists
  const studentExists = await Student.findOne({ $or: [{ email }, { rollNumber }] });
  if (studentExists) {
    res.status(400);
    throw new Error('Student with this email or roll number already exists');
  }

  // 2. Create new student (no bcrypt, as requested)
  const student = await Student.create({
    name,
    email,
    password,
    rollNumber,
    phone,
    parentName,
    primaryParentPhone,
    secondaryParentPhone,
    class: classId,
    attendancePercentage,
  });

  if (student) {
    res.status(201).json({
      _id: student._id,
      name: student.name,
      email: student.email,
      role: student.role,
      class: student.class,
    });
  } else {
    res.status(400);
    throw new Error('Invalid student data');
  }
});

/**
 * @desc    Register a new employee
 * @route   POST /api/auth/register/employee
 * @access  Private (Admin)
 */
export const registerEmployee = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    employeeId,
    phone,
    department: departmentId, // Admin provides the Department ID
    role,
  } = req.body;

  // 1. Check if employee already exists
  const employeeExists = await Employee.findOne({ $or: [{ email }, { employeeId }] });
  if (employeeExists) {
    res.status(400);
    throw new Error('Employee with this email or employee ID already exists');
  }

  // 2. Create new employee (no bcrypt, as requested)
  const employee = await Employee.create({
    name,
    email,
    password,
    employeeId,
    phone,
    department: departmentId,
    role,
  });

  if (employee) {
    res.status(201).json({
      _id: employee._id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      department: employee.department,
    });
  } else {
    res.status(400);
    throw new Error('Invalid employee data');
  }
});

// controllers/authController.js

// ... (registerStudent and registerEmployee are fine) ...

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  let user = null;

  // 1. Find the user
  user = await Admin.findOne({ email });
  if (!user) {
    user = await Student.findOne({ email }).populate({
      path: 'class',
      populate: { path: 'department' }
    });
  }
  if (!user) {
    user = await Employee.findOne({ email }).populate('department');
  }

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // 2. Direct password check
  if (password === user.password) {
    
    // 3. Generate token
    const token = generateToken(user._id, user.role);

    // 4. (REMOVED) res.cookie() part is gone.

    // 5. Build the response data
    let responseData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: token, // <-- ADD THIS LINE
    };

    // Add role-specific fields
    if (user.role === 'student') {
      responseData = {
        ...responseData,
        // ... all student fields
      };
    } else if (['faculty', 'hod', 'security'].includes(user.role)) {
      responseData = {
        ...responseData,
        // ... all employee fields
      };
    }

    res.status(200).json(responseData);
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});