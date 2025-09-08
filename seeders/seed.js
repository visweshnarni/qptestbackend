import dotenv from 'dotenv';
import connectDB from '../src/config/db.js';
import Admin from '../src/models/Admin.js';

dotenv.config();
connectDB();

const seedAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ email: 'admin@quickpass.com' });

    if (adminExists) {
      console.log('Admin user already exists!');
      process.exit();
    }

    await Admin.create({
      name: 'QuickPass Admin',
      email: 'admin@quickpass.com',
      password: 'password123', // Change this to a secure password later
      role: 'admin',
    });

    console.log('Admin user created successfully!');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

seedAdmin();
