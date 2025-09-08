// src/controllers/authController.js

import asyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
  const { name, email, password, rollNumber, department, year, phone, parentName, parentPhone } = req.body;

  // 1. Check if student already exists.
  const studentExists = await Student.findOne({ $or: [{ email }, { rollNumber }] });
  if (studentExists) {
    res.status(400);
    throw new Error('Student with this email or roll number already exists');
  }

  // 2. Hash password.
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // 3. Create new student record.
  const student = await Student.create({
    name,
    email,
    password: hashedPassword,
    rollNumber,
    department,
    year,
    phone,
    parentName,
    parentPhone,
  });

  if (student) {
    // 4. Respond with success message.
    res.status(201).json({
      _id: student._id,
      name: student.name,
      email: student.email,
      role: student.role,
      token: generateToken(student._id, student.role),
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
  const { name, email, password, employeeId, department, phone, role } = req.body;

  // 1. Check if employee already exists.
  const employeeExists = await Employee.findOne({ $or: [{ email }, { employeeId }] });
  if (employeeExists) {
    res.status(400);
    throw new Error('Employee with this email or employee ID already exists');
  }

  // 2. Hash password.
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // 3. Create new employee record.
  const employee = await Employee.create({
    name,
    email,
    password: hashedPassword,
    employeeId,
    department,
    phone,
    role,
  });

  if (employee) {
    // 4. Respond with success message.
    res.status(201).json({
      _id: employee._id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      token: generateToken(employee._id, employee.role),
    });
  } else {
    res.status(400);
    throw new Error('Invalid employee data');
  }
});

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  let user = null;

  // 1. Find the user by email in Admin, Student, or Employee models.
  user = await Admin.findOne({ email });
  if (!user) {
    user = await Student.findOne({ email });
  }
  if (!user) {
    user = await Employee.findOne({ email });
  }

  // If no user is found, send a 401 unauthorized error.
  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // 2. Compare the provided password with the hashed password.
  const isMatch = await bcrypt.compare(password, user.password);

  // If the passwords match, generate a JWT token.
  if (isMatch) {
    // 3. Generate a JWT token and send it in the response.
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });
  } else {
    // 4. If no match, send an error.
    res.status(401);
    throw new Error('Invalid email or password');
  }
});
