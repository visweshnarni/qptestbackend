import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import moment from 'moment-timezone';
import mongoose from 'mongoose';
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js';

/* --------------------------------------------
   1. SCAN QR CODE & MARK EXITED
   -------------------------------------------- */
/**
 * @desc    Verify QR token and mark outpass as exited
 * @route   POST /api/security/scan-qr
 * @access  Private (Security)
 */
export const scanQrAndExit = asyncHandler(async (req, res) => {
  const { qrToken } = req.body;
  const securityGuardId = req.user.id;

  if (!qrToken) {
    return res.status(400).json({ message: "QR Token is required." });
  }

  try {
    // 1. Verify the JWT Token
    const decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
    const outpassId = decoded.outpassId;

    // 2. Find the Outpass
    const outpass = await Outpass.findById(outpassId).populate('student', 'name rollNumber');

    if (!outpass) {
      return res.status(404).json({ message: "Outpass not found." });
    }

    // 3. Check Outpass Status
    if (outpass.status === 'exited') {
      return res.status(400).json({ message: "Student has already exited the campus." });
    }
    if (outpass.status !== 'approved') {
      return res.status(400).json({ message: `Invalid status: ${outpass.status}. Outpass must be approved.` });
    }

    // 4. Update the Outpass
    outpass.status = 'exited';
    outpass.actualExitTime = new Date();
    outpass.exitVerified = {
      status: true,
      by: securityGuardId,
      at: new Date()
    };

    await outpass.save();

    // 5. Send Success Response
    res.status(200).json({
      message: "Student verified and marked as exited successfully.",
      data: {
        studentName: outpass.student.name,
        rollNumber: outpass.student.rollNumber,
        outpassId: outpass._id,
        exitTime: moment(outpass.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
        returnTime: moment(outpass.dateTo).tz('Asia/Kolkata').format('h:mm A'),
        status: outpass.status
      }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ message: "QR Code has expired. Student must generate a new one." });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ message: "Invalid QR Code signature." });
    }
    throw error;
  }
});


/* --------------------------------------------
   2. SEARCH OUTPASS (MANUAL ENTRY)
   -------------------------------------------- */
/**
 * @desc    Search for an approved outpass by Roll Number or Outpass ID
 * @route   GET /api/security/search-outpass?query=...
 * @access  Private (Security)
 */
export const searchOutpass = asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ message: "Please provide a Roll Number or Outpass ID." });
  }

  let outpass = null;
  const searchStr = query.trim();

  // Check if it's a valid MongoDB ObjectId (Outpass ID search)
  if (mongoose.Types.ObjectId.isValid(searchStr)) {
    outpass = await Outpass.findOne({ _id: searchStr, status: 'approved' })
      .populate('student', 'name rollNumber');
  } 
  
  // If not found by ID, search by Student Roll Number
  if (!outpass) {
    const student = await Student.findOne({ 
      rollNumber: { $regex: new RegExp(`^${searchStr}$`, 'i') } 
    });

    if (student) {
      // Find the currently active approved outpass for this student
      outpass = await Outpass.findOne({ 
        student: student._id, 
        status: 'approved' 
      }).populate('student', 'name rollNumber');
    }
  }

  if (!outpass) {
    return res.status(404).json({ 
      message: "No active approved outpass found for this Roll Number or ID. The request might still be pending, already exited, or invalid." 
    });
  }

  res.status(200).json({
    data: {
      outpassId: outpass._id,
      studentName: outpass.student.name,
      rollNumber: outpass.student.rollNumber,
      reasonCategory: outpass.reasonCategory,
      exitTime: moment(outpass.dateFrom).tz('Asia/Kolkata').format('DD MMM, h:mm A'),
      returnTime: moment(outpass.dateTo).tz('Asia/Kolkata').format('DD MMM, h:mm A'),
    }
  });
});


/* --------------------------------------------
   3. MANUAL MARK AS EXITED
   -------------------------------------------- */
/**
 * @desc    Manually mark an approved outpass as exited
 * @route   PUT /api/security/mark-exited/:id
 * @access  Private (Security)
 */
export const markExited = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const securityGuardId = req.user.id;

  const outpass = await Outpass.findById(id).populate('student', 'name rollNumber');

  if (!outpass) {
    return res.status(404).json({ message: "Outpass not found." });
  }

  if (outpass.status === 'exited') {
    return res.status(400).json({ message: "Student has already exited the campus." });
  }

  if (outpass.status !== 'approved') {
    return res.status(400).json({ message: `Cannot exit. Outpass status is currently: ${outpass.status}` });
  }

  // Update Outpass
  outpass.status = 'exited';
  outpass.actualExitTime = new Date();
  outpass.exitVerified = {
    status: true,
    by: securityGuardId,
    at: new Date()
  };

  await outpass.save();

  res.status(200).json({
    message: "Student verified and marked as exited successfully.",
    data: {
      studentName: outpass.student.name,
      rollNumber: outpass.student.rollNumber,
      outpassId: outpass._id,
      status: outpass.status
    }
  });
});