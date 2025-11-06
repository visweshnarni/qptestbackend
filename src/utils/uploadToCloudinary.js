// src/utils/cloudinaryUpload.js

import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import multer from 'multer';
import streamifier from 'streamifier';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * @desc Uploads a buffer to Cloudinary
 * @param {Buffer} buffer - The file buffer
 * @param {string} studentName - The student's name, used for folder
 * @param {string} originalFilename - The original name of the file
 */
const uploadBufferToCloudinary = (buffer, studentName, originalFilename) => {
  return new Promise((resolve, reject) => {
    // Sanitize student name for folder
    const folderName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
    // Create a unique public_id
    const publicId = `qp/${folderName}/${Date.now()}_${originalFilename}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'auto', // Detect file type automatically (image, pdf, etc.)
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary Upload Error:', error);
          return reject(error);
        }
        resolve(result.secure_url); // Return the secure URL
      }
    );

    // Use streamifier to pipe the buffer to the upload stream
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * @desc Multer middleware to handle single file upload in memory
 */
// Use multer.memoryStorage() to keep the file in memory as a buffer
const storage = multer.memoryStorage();
export const upload = multer({ storage: storage });

export default uploadBufferToCloudinary;