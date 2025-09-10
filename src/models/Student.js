import mongoose from 'mongoose';

const studentSchema = mongoose.Schema(
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
      required: true, // stored as plain text
    },
    rollNumber: {
      type: String,
      required: true,
      unique: true,
    },
    department: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    parentName: {
      type: String,
      required: true,
    },
    parentPhone: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      default: 'student',
    },
  },
  {
    timestamps: true,
  }
);

// ❌ Removed bcrypt middleware (plain text password only)

const Student = mongoose.model('Student', studentSchema);

export default Student;
