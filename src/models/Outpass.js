// models/Outpass.js
import mongoose from 'mongoose';

const outpassSchema = mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Student',
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
    // The main status of the outpass request
    status: {
      type: String,
      enum: ['pending_faculty', 'pending_hod', 'approved', 'rejected'],
      default: 'pending_faculty',
    },
    
    // Tracks *who* approved it at the faculty level
    facultyApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    // Tracks *who* approved it at the HOD level
    hodApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    
    // A log for when the parent was (supposedly) contacted
    parentContactVerified: {
      status: { 
        type: Boolean, 
        default: false 
      },
      by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Employee' 
      },
      at: { 
        type: Date 
      },
    },
    
    // If status is 'rejected', this field should be filled
    rejectionReason: {
      type: String,
    },

    // A list of faculty IDs that we sent notifications to
    notifiedFaculty: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    }],
  },
  { timestamps: true }
);

const Outpass = mongoose.model('Outpass', outpassSchema);
export default Outpass;