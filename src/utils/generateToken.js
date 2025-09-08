// src/utils/generateToken.js

import jwt from 'jsonwebtoken';

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '1h', // The token will expire in 1 hour
  });
};

export default generateToken;
