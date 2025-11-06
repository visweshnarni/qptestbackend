import jwt from 'jsonwebtoken';

const generateToken = (id, role) => {
  return jwt.sign(
    { id, role }, // Include both id and role
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

export default generateToken;
