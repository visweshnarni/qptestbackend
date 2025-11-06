// models/TimetableSlot.js
import mongoose from 'mongoose';

const timetableSlotSchema = mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee', // The faculty member who is busy
    required: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class', // The class they are teaching
    required: true,
  },
  // Use numbers: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6,
  },
  // Store time in 24-hour format, e.g., "09:00"
  startTime: {
    type: String,
    required: true, // e.g., "09:00"
  },
  endTime: {
    type: String,
    required: true, // e.g., "10:00"
  },
}, { timestamps: true });

const TimetableSlot = mongoose.model('TimetableSlot', timetableSlotSchema);
export default TimetableSlot;