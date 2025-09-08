// src/server.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// Import database connection function
import connectDB from './src/config/db.js';

// Import all the modular routes
import authRoutes from './src/routes/authRoutes.js';
import studentRoutes from './src/routes/studentRoutes.js';
import employeeRoutes from './src/routes/employeeRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import outpassRoutes from './src/routes/outpassRoutes.js';

// ESM-equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Create the Express app instance
const app = express();

// Middleware setup
// Enable CORS for all origins
app.use(cors());
// Parse incoming JSON payloads
app.use(express.json());
// Parse cookies attached to the client request
app.use(cookieParser());

// Mount the routes to their respective API endpoints
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/outpass', outpassRoutes);

// A simple root route to confirm the API is running
app.get('/', (req, res) => res.send('🎉 QuickPass API is Running!'));

// Set the port from environment variables or default to 5000
const PORT = process.env.PORT || 5000;

// Function to connect to the database and then start the server
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error(`Failed to connect to the database: ${err.message}`);
    process.exit(1);
  }
};

// Start the server
startServer();
