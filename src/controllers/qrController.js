import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import moment from 'moment-timezone';
import Outpass from '../models/Outpass.js';
import CollegeConfig from '../models/CollegeConfig.js';
import { calculateDistanceMeters } from '../utils/locationUtils.js'; // Assuming you extract this from outpassController

/**
 * @desc    Generate a secure, time-sensitive QR token for an approved outpass
 * @route   POST /api/qr/generate
 * @access  Private (Student)
 */
export const generateQrToken = asyncHandler(async (req, res) => {
  const studentId = req.user.id;
  const { outpassId, latitude, longitude } = req.body;

  if (!outpassId || !latitude || !longitude) {
    return res.status(400).json({ message: "Missing required fields (outpassId, latitude, longitude)." });
  }

  // 1. Verify the outpass is valid and belongs to the student
  const outpass = await Outpass.findOne({ _id: outpassId, student: studentId })
    .populate('student', 'name rollNumber');

  if (!outpass) {
    return res.status(404).json({ message: "Outpass not found." });
  }

  if (outpass.status !== 'approved') {
    return res.status(400).json({ message: `Cannot generate QR for an outpass with status: ${outpass.status}` });
  }

  // 2. Verify Location (Optional, but highly recommended for gate security)
  const config = await CollegeConfig.findOne();
  const validityMinutes = config?.qrValidityMinutes || 5;

  const distance = calculateDistanceMeters(
    latitude,
    longitude,
    config.location.latitude,
    config.location.longitude
  );

  // You might want a slightly larger radius for the gate than for applying
  if (distance > (config.allowedRadiusMeters + 100)) {
     return res.status(400).json({ message: "You must be near the campus gate to generate a QR code." });
  }

  // 3. Check Date/Time Boundaries
  const now = moment().tz("Asia/Kolkata");
  const exitStart = moment(outpass.dateFrom).tz("Asia/Kolkata");
  
  // Example: Prevent generating QR more than 30 mins before their exit time
  if (now.isBefore(exitStart.subtract(30, 'minutes'))) {
     return res.status(400).json({ message: "Too early. You can only generate a gatepass 30 minutes before your requested exit time." });
  }

  // 4. Generate the JWT Payload
  const qrPayload = {
    outpassId: outpass._id,
    studentId: studentId,
    rollNumber: outpass.student.rollNumber,
    name: outpass.student.name,
    generatedAtLoc: { lat: latitude, lng: longitude },
    type: 'gatepass_exit'
  };

  // 5. Sign the Token with expiration
  const qrToken = jwt.sign(qrPayload, process.env.JWT_SECRET, {
    expiresIn: `${validityMinutes}m`
  });

  res.status(200).json({
    token: qrToken,
    expiresAt: now.add(validityMinutes, 'minutes').toDate(),
    validForMinutes: validityMinutes
  });
});