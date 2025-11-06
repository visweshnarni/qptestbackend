// models/Student.js
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
      required: true, // 🚨 DANGER: Store hashed passwords, not plain text!
    },
    rollNumber: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    parentName: {
      type: String,
      required: true,
    },

    // MODIFICATION: Changed to primary and secondary numbers
    primaryParentPhone: {
      type: String,
      required: true, // This one is mandatory
    },
    secondaryParentPhone: {
      type: String, // No 'required: true', so this is optional
    },
    
    // This 'class' field links to the Class model
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    attendancePercentage: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
      max: 100,
    },
    role: {
      type: String,
      default: 'student',
    },
  },
  { timestamps: true }
);

const Student = mongoose.model('Student', studentSchema);
export default Student;