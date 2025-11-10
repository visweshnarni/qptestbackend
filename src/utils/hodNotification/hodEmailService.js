import nodemailer from 'nodemailer';
import moment from 'moment-timezone';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a summary email to the HOD about all pending requests.
 * @param {object} hod - Employee document with .email and .name
 * @param {number} pendingCount - Number of pending requests for their department
 */
export const sendHodSummaryEmail = async (hod, pendingCount) => {
  try {
    const mailOptions = {
      from: `"QuickPass System" <${process.env.EMAIL_USER}>`,
      to: hod.email,
      subject: `Pending Outpass Requests in Your Department`,
      html: `
        <p>Hello <b>${hod.name}</b>,</p>
        <p>There are currently <b>${pendingCount}</b> student outpass requests awaiting your approval.</p>
        <p>Please log in to your QuickPass dashboard to review and take action.</p>
        <p><i>Note:</i> This reminder will be re-sent every 15 minutes if pending requests remain.</p>
        <p>Thank you,<br>QuickPass System</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 HOD Email sent to ${hod.email}`);
  } catch (error) {
    console.error(`❌ Failed to send HOD email to ${hod.email}:`, error);
  }
};
