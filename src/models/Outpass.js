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
    dateFrom: { type: Date, required: true }, // Expected exit time
    dateTo: { type: Date, required: true },   // Expected return time
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
        'cancelled_by_student',
        'exited' // ✅ new: when verified by security
      ],
      default: 'pending_faculty',
    },

    facultyApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    hodApprover: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    assignedMentor: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

    parentContactVerified: {
      status: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      at: { type: Date },
    },

    rejectionReason: { type: String },
    notifiedFaculty: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],

    // ✅ NEW security checkpoint fields
    exitVerified: {
      status: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // security guard ID
      at: { type: Date },
    },
    returnVerified: {
      status: { type: Boolean, default: false },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      at: { type: Date },
    },

    // ✅ Actual gate timestamps
    actualExitTime: { type: Date },
    actualReturnTime: { type: Date },
  },
  { timestamps: true }
);

const Outpass = mongoose.model('Outpass', outpassSchema);
export default Outpass;
