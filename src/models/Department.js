// models/Department.js
import mongoose from 'mongoose';

const departmentSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  hod: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    // required: true, <-- REMOVE THIS LINE
  },
}, { timestamps: true });

const Department = mongoose.model('Department', departmentSchema);
export default Department;