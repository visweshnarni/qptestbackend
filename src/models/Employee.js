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
      required: true, // stored as plain text
    },
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },
    department: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['faculty', 'hod', 'mentor', 'protocol_officer'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// ❌ Removed bcrypt pre-save hook (plain text only)

const Employee = mongoose.model('Employee', employeeSchema);

export default Employee;
