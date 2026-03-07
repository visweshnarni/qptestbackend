// server.js

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

// Import database connection function
import connectDB from './src/config/db.js';

// --- NEW: Import Agenda ---
import agenda from './src/config/agenda.js';
import parentIvrRoutes from './src/routes/parentIvrRoutes.js';
import qrRoutes from './src/routes/qrRoutes.js'; // ✅ ADD THIS LINE



// Import all the modular routes
import authRoutes from './src/routes/authRoutes.js';
import studentRoutes from './src/routes/studentRoutes.js';
import employeeRoutes from './src/routes/employeeRoutes.js';
import adminRoutes from './src/routes/adminRoutes.js';
import outpassRoutes from './src/routes/outpassRoutes.js';
import facultyRoutes from './src/routes/facultyRoutes.js';

import hodRoutes from './src/routes/hodRoutes.js';

// ESM-equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Create the Express app instance
const app = express();
app.use(express.urlencoded({ extended: true }));

// --------------------
// Middleware setup
// --------------------
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true, 
}));
app.use(express.json());
app.use(cookieParser());

// --- NEW: Make Agenda available to your app's controllers ---
app.locals.agenda = agenda;

// --------------------
// API Routes
// --------------------
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/outpass', outpassRoutes);
app.use('/api/faculty', facultyRoutes); // ✅ ADD THIS LINE

app.use('/api/hod', hodRoutes);
app.use("/api/parent-ivr", parentIvrRoutes);

app.use("/api/qr", qrRoutes); // ✅ ADD THIS LINE



app.get('/', (req, res) => res.send('🎉 QuickPass API is Running!'));

// --------------------
// Start server
// --------------------
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();
    
    // 2. Start the Express server
    app.listen(PORT, async () => { // <-- Made this callback async
      console.log(`✅ Server running on http://localhost:${PORT}`);
      
      // 3. --- NEW: Start the Agenda job processor ---
      await agenda.start();
      console.log('✅ Agenda job processor started.');
    });
  } catch (err) {
    console.error(`❌ Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

startServer();