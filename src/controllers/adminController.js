// src/controllers/adminController.js

import asyncHandler from 'express-async-handler';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import Outpass from '../models/Outpass.js';
// Import the new models
import Department from '../models/Department.js';
import Class from '../models/Class.js';
import TimetableSlot from '../models/TimetableSlot.js ';

// --- User & Outpass Listing (Your Existing Code) ---

/**
 * @desc    List all students & employees
 * @route   GET /api/admin/users
 * @access  Private (Admin)
 */
export const listAllUsers = asyncHandler(async (req, res) => {
  const students = await Student.find().select('-password').populate('class', 'name');
  const employees = await Employee.find().select('-password').populate('department', 'name');

  res.status(200).json({ students, employees });
});

/**
 * @desc    List all outpasses in system
 * @route   GET /api/admin/outpasses
 * @access  Private (Admin)
 */
export const listAllOutpasses = asyncHandler(async (req, res) => {
  const outpasses = await Outpass.find({})
    .populate('student', 'name rollNumber') // Switched to 'student' ref
    .sort({ createdAt: -1 });

  res.status(200).json(outpasses);
});

// --- 🏛️ Department Management ---

/**
 * @desc    Create a new department
 * @route   POST /api/admin/departments
 * @access  Private (Admin)
 */
export const createDepartment = asyncHandler(async (req, res) => {
  const { name, hod } = req.body; // HOD should be an Employee ID

  const departmentExists = await Department.findOne({ name });
  if (departmentExists) {
    res.status(400);
    throw new Error('Department with this name already exists');
  }

  const department = await Department.create({ name, hod });
  res.status(201).json(department);
});

/**
 * @desc    Get all departments
 * @route   GET /api/admin/departments
 * @access  Private (Admin)
 */
export const getDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find({}).populate('hod', 'name email employeeId');
  res.status(200).json(departments);
});

/**
 * @desc    Update a department (e.g., assign new HOD)
 * @route   PUT /api/admin/departments/:id
 * @access  Private (Admin)
 */
export const updateDepartment = asyncHandler(async (req, res) => {
  const { name, hod } = req.body;
  
  const department = await Department.findById(req.params.id);

  if (department) {
    department.name = name || department.name;
    department.hod = hod || department.hod;
    const updatedDepartment = await department.save();
    res.status(200).json(updatedDepartment);
  } else {
    res.status(404);
    throw new Error('Department not found');
  }
});

/**
 * @desc    Delete a department
 * @route   DELETE /api/admin/departments/:id
 * @access  Private (Admin)
 */
export const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);

  if (department) {
    // Add check: You might want to prevent deleting if classes are assigned
    await Department.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Department removed' });
  } else {
    res.status(404);
    throw new Error('Department not found');
  }
});


// --- 📚 Class Management ---

/**
 * @desc    Create a new class
 * @route   POST /api/admin/classes
 * @access  Private (Admin)
 */
export const createClass = asyncHandler(async (req, res) => {
  const { name, department, mentors, year } = req.body;

  const classExists = await Class.findOne({ name });
  if (classExists) {
    res.status(400);
    throw new Error('Class with this name already exists');
  }

  const newClass = await Class.create({
    name,
    department, // Department ID
    mentors,    // Array of Employee IDs
    year,
  });
  res.status(201).json(newClass);
});

/**
 * @desc    Get all classes
 * @route   GET /api/admin/classes
 * @access  Private (Admin)
 */
export const getClasses = asyncHandler(async (req, res) => {
  const classes = await Class.find({})
    .populate('department', 'name')
    .populate('mentors', 'name email');
  res.status(200).json(classes);
});

/**
 * @desc    Update a class
 * @route   PUT /api/admin/classes/:id
 * @access  Private (Admin)
 */
export const updateClass = asyncHandler(async (req, res) => {
  const { name, department, mentors, year } = req.body;

  const aClass = await Class.findById(req.params.id);

  if (aClass) {
    aClass.name = name || aClass.name;
    aClass.department = department || aClass.department;
    aClass.mentors = mentors || aClass.mentors;
    aClass.year = year || aClass.year;

    const updatedClass = await aClass.save();
    res.status(200).json(updatedClass);
  } else {
    res.status(404);
    throw new Error('Class not found');
  }
});

/**
 * @desc    Delete a class
 * @route   DELETE /api/admin/classes/:id
 * @access  Private (Admin)
 */
export const deleteClass = asyncHandler(async (req, res) => {
  const aClass = await Class.findById(req.params.id);

  if (aClass) {
    // Add check: You might want to prevent deleting if students are assigned
    await Class.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Class removed' });
  } else {
    res.status(404);
    throw new Error('Class not found');
  }
});


// --- 🗓️ Timetable Management ---

/**
 * @desc    Create a new timetable slot
 * @route   POST /api/admin/timetable
 * @access  Private (Admin)
 */
export const createTimetableSlot = asyncHandler(async (req, res) => {
  const { employee, class: classId, dayOfWeek, startTime, endTime } = req.body;

  const newSlot = await TimetableSlot.create({
    employee, // Employee ID
    class: classId, // Class ID
    dayOfWeek,
    startTime,
    endTime,
  });
  res.status(201).json(newSlot);
});

/**
 * @desc    Get all timetable slots for a specific class
 * @route   GET /api/admin/timetable/class/:classId
 * @access  Private (Admin)
 */
export const getTimetableByClass = asyncHandler(async (req, res) => {
  const slots = await TimetableSlot.find({ class: req.params.classId })
    .populate('employee', 'name employeeId')
    .populate('class', 'name')
    .sort({ dayOfWeek: 1, startTime: 1 });
  
  res.status(200).json(slots);
});

/**
 * @desc    Get all timetable slots for a specific employee
 * @route   GET /api/admin/timetable/employee/:employeeId
 * @access  Private (Admin)
 */
export const getTimetableByEmployee = asyncHandler(async (req, res) => {
  const slots = await TimetableSlot.find({ employee: req.params.employeeId })
    .populate('employee', 'name')
    .populate('class', 'name')
    .sort({ dayOfWeek: 1, startTime: 1 });

  res.status(200).json(slots);
});

/**
 * @desc    Delete a timetable slot
 * @route   DELETE /api/admin/timetable/:id
 * @access  Private (Admin)
 */
export const deleteTimetableSlot = asyncHandler(async (req, res) => {
  const slot = await TimetableSlot.findById(req.params.id);

  if (slot) {
    await TimetableSlot.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Timetable slot removed' });
  } else {
    res.status(404);
    throw new Error('Timetable slot not found');
  }
});