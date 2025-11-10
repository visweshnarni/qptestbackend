import mongoose from 'mongoose';

const outpassSchema = mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Student',
    },
    reasonCategory: { type: String, required: true },
    reason: { type: String, required: true },
    dateFrom: { type: Date, required: true },
    dateTo: { type: Date, required: true },
    alternateContact: { type: String },
    supportingDocumentUrl: { type: String },
    attendanceAtApply: { type: Number },
    status: {
      type: String,
      enum: [
        'pending_faculty',
        'pending_hod',
        'approved',
        'rejected',
        'cancelled_by_student', // ✅ new
      ],
      default: 'pending_faculty',
    },

    facultyApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    hodApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

    // Optional: assigned mentor (or class advisor)
    assignedMentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

    parentContactVerified: {
      status: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      at: { type: Date },
    },
    rejectionReason: { type: String },
    notifiedFaculty: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
  },
  { timestamps: true }
);

const Outpass = mongoose.model('Outpass', outpassSchema);
export default Outpass;
