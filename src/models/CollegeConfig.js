// models/CollegeConfig.js
import mongoose from "mongoose";

const collegeConfigSchema = mongoose.Schema({
  name: { type: String, required: true },

  location: {
    latitude: Number,
    longitude: Number,
  },

  allowedRadiusMeters: {
    type: Number,
    default: 300
  },

  collegeStartTime: {
    type: String,
    default: "08:00"
  },

  collegeEndTime: {
    type: String,
    default: "17:00"
  },

  parentCallRetryMinutes: {
    type: Number,
    default: 15
  },
  // Add this inside your schema
  qrValidityMinutes: {
    type: Number,
    default: 5
  }

}, { timestamps: true });

const CollegeConfig = mongoose.model("CollegeConfig", collegeConfigSchema);
export default CollegeConfig;