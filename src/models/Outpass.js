// models/Outpass.js
import mongoose from 'mongoose';

const outpassSchema = mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Student',
    },
    // NEW: From the form's category buttons
    reasonCategory: {
      type: String,
      required: true,
      // <-- MODIFIED: Removed the 'enum' array to allow any string
    },
    reason: {
      type: String,
      required: true,
    },
    // dateFrom and dateTo will be the full exit and return timestamps
    dateFrom: {
      type: Date,
      required: true,
    },
    dateTo: {
      type: Date,
      required: true,
    },
    // NEW: Optional alternate contact number
    alternateContact: {
      type: String,
    },
    // NEW: URL for the uploaded file from Cloudinary
    supportingDocumentUrl: {
      type: String,
    },
    // NEW: Store the student's attendance at the time of application
    attendanceAtApply: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['pending_faculty', 'pending_hod', 'approved', 'rejected'],
      default: 'pending_faculty',
    },
    facultyApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    hodApprover: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    parentContactVerified: {
      status: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      at: { type: Date },
    },
    rejectionReason: {
      type: String,
    },
    notifiedFaculty: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    }],
  },
  { timestamps: true }
);

const Outpass = mongoose.model('Outpass', outpassSchema);
export default Outpass;