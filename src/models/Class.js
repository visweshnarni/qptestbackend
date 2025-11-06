// models/Class.js
import mongoose from 'mongoose';

const classSchema = mongoose.Schema({
  name: {
    type: String,
    required: true, // e.g., 'CSO 3rd Year', 'Mech 2nd Year A'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true,
  },
  // This is the list of primary mentors for this class
  mentors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
  }],
  year: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

const Class = mongoose.model('Class', classSchema);
export default Class;