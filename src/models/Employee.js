// models/Employee.js
import mongoose from 'mongoose';

const employeeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true, // 🚨 DANGER: Store hashed passwords, not plain text!
    },
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true, // Needed for Twilio
    },
    // Links to the Department model
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    // Defines what this employee can do
    role: {
      type: String,
      enum: ['faculty', 'hod', 'security'],
      required: true,
    },
  },
  { timestamps: true }
);

const Employee = mongoose.model('Employee', employeeSchema);
export default Employee;