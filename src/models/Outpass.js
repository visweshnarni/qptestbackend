// src/models/Outpass.js

import mongoose from 'mongoose';

const outpassSchema = mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Student', // Reference to the Student model
    },
    reason: {
      type: String,
      required: true,
    },
    dateFrom: {
      type: Date,
      required: true,
    },
    dateTo: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending_faculty', 'pending_hod', 'approved', 'rejected'],
      default: 'pending_faculty',
    },
    facultyApproval: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      timestamp: {
        type: Date,
      },
    },
    hodApproval: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      timestamp: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

const Outpass = mongoose.model('Outpass', outpassSchema);

export default Outpass;
