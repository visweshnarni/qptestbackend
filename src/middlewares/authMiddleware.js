// middlewares/authMiddleware.js

import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import Admin from '../models/Admin.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';

/**
 * @desc Middleware to protect routes and verify JWT token
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Check for the token in the request cookies
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. Fallback to the Authorization header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // === THIS IS THE UPDATED LOGIC ===
    // Fetch the user from the correct collection based on the role in the token

    let user;
    
    // Find in Admins
    if (decoded.role === 'admin') {
      user = await Admin.findById(decoded.id).select('-password');
    } 
    // Find in Students
    else if (decoded.role === 'student') {
      user = await Student.findById(decoded.id).select('-password');
    } 
    // Find in Employees (using the new roles)
    else if (['faculty', 'hod', 'security'].includes(decoded.role)) {
      user = await Employee.findById(decoded.id).select('-password');
    }

    if (!user) {
      res.status(401);
      throw new Error('User not found');
    }

    // Attach the full user object to the request
    req.user = user;
    next();
    
  } catch (error) {
    console.error(error);
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

/**
 * @desc Middleware to check for user roles
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};