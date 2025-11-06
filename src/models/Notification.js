// models/Notification.js
import mongoose from 'mongoose';

const notificationSchema = mongoose.Schema(
  {
    // The user (faculty, HOD) who receives this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    
    // Optional: The user who triggered it (the student)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
    },

    // The message for the dashboard, e.g., "Roll No. 123 has requested an outpass."
    message: {
      type: String,
      required: true,
    },

    // To track if the faculty member has clicked on it
    read: {
      type: Boolean,
      default: false,
    },

    // A direct link to the outpass this is about
    outpass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Outpass',
      required: true,
    },
    
    // Type to help filter, e.g., 'new_request', 'reminder', 'approved'
    type: {
      type: String,
      enum: ['new_request', 'reminder', 'approved', 'rejected'],
      default: 'new_request',
    }
  },
  { timestamps: true }
);

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;