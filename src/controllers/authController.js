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
  const { name, email, password, rollNumber, department, year, phone, parentName, parentPhone } = req.body;

  // 1. Check if student already exists.
  const studentExists = await Student.findOne({ $or: [{ email }, { rollNumber }] });
  if (studentExists) {
    res.status(400);
    throw new Error('Student with this email or roll number already exists');
  }

  // 2. Create new student record (no bcrypt).
  const student = await Student.create({
    name,
    email,
    password,
    rollNumber,
    department,
    year,
    phone,
    parentName,
    parentPhone,
  });

  if (student) {
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

  // 2. Create new employee record (no bcrypt).
  const employee = await Employee.create({
    name,
    email,
    password,
    employeeId,
    department,
    phone,
    role,
  });

  if (employee) {
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
  if (!user) user = await Student.findOne({ email });
  if (!user) user = await Employee.findOne({ email });

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  console.log("🔍 User found in DB:", {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
  // console.log("Entered password:", password);
  // console.log("Stored password in DB:", user.password);

  // 2. Direct password check (no bcrypt).
  if (password === user.password) {
    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, user.role),
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});
