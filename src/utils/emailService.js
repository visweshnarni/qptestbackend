import nodemailer from 'nodemailer';
import moment from 'moment-timezone';
import dotenv from 'dotenv';
dotenv.config();


// 1. Create a "transporter" (the service that sends the email)
// We'll use Gmail here. For production, use SendGrid or AWS SES.
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or your email provider
  auth: {
    user: process.env.EMAIL_USER, // Your email address from .env
    pass: process.env.EMAIL_PASS, // Your email password or App Password from .env
  },
});

/**
 * Sends a notification email to a faculty member.
 * @param {object} faculty - The employee object (must have .name and .email)
 * @param {object} student - The student object (must have .name)
 * @param {object} outpass - The outpass object
 */
export const sendNotificationEmail = async (faculty, student, outpass) => {
  try {
    const mailOptions = {
      from: `"QuickPass System" <${process.env.EMAIL_USER}>`,
      to: faculty.email,
      subject: `Outpass Request for ${student.name}`,
      html: `
        <p>Hello ${faculty.name},</p>
        <p>A student, <b>${student.name}</b>, has requested an outpass for the following reason:</p>
        <p><b>Reason:</b> ${outpass.reason}</p>
        <p><b>Time:</b> ${moment(outpass.dateFrom).tz('Asia/Kolkata').format('h:mm A')} to ${moment(outpass.dateTo).tz('Asia/Kolkata').format('h:mm A')}</p>
        <p>Please log in to your QuickPass dashboard to approve or reject this request.</p>
        <p>Thank you.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${faculty.email}`);
  } catch (error) {
    console.error(`Failed to send email to ${faculty.email}:`, error);
  }
};