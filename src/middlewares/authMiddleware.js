import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
// You'll need to uncomment these imports if you're using them to populate req.user
// import Admin from '../models/Admin.js';
// import Student from '../models/Student.js';
// import Employee from '../models/Employee.js';

/**
 * @desc Middleware to protect routes and verify JWT token
 * This function checks for a token in the request header or cookies,
 * verifies it, and attaches the user object to the request.
 */
export const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1. Check for the token in the request cookies (most common for web apps)
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // 2. Fallback to the Authorization header (good for API clients like Postman)
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no token is found from either source
  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  try {
    // Verify the token using the JWT secret from environment variables
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // We need to fetch the user based on the decoded ID and role.
    // This is a placeholder and will be fully implemented once models are created.
    // For now, we'll assume the token contains the user's ID and role.
    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    console.error(error);
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

/**
 * @desc Middleware to check for user roles
 * This is a higher-order function that takes allowed roles as arguments
 * and returns a middleware function.
 */
export const authorize = (...roles) => {
  // Return the actual middleware function
  return (req, res, next) => {
    // Check if the user's role is included in the allowed roles
    if (!roles.includes(req.user.role)) {
      // If not, send a 403 Forbidden error
      return res.status(403).json({
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    // If the role is authorized, continue to the next middleware
    next();
  };
};