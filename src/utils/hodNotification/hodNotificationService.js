import Outpass from '../../models/Outpass.js';
import Employee from '../../models/Employee.js';
import { sendHodSummaryEmail } from './hodEmailService.js';
import { makeHodSummaryCall } from './hodTwilioService.js';

/**
 * Notify all HODs if there are any pending approvals in their department.
 */
export const notifyPendingHodRequests = async () => {
  try {
    console.log('🔔 Running HOD notification check...');

    // 1️⃣ Get all HODs
    const hods = await Employee.find({ role: 'hod' })
      .populate('department', 'name')
      .lean();

    for (const hod of hods) {
      if (!hod.department) continue;

      // 2️⃣ Count pending requests in their department
      const pendingCount = await Outpass.countDocuments({
        status: 'pending_hod',
      }).populate({
        path: 'student',
        match: { department: hod.department._id },
      });

      if (pendingCount > 0) {
        console.log(`📢 Notifying HOD ${hod.name} — ${pendingCount} requests pending.`);

        await sendHodSummaryEmail(hod, pendingCount);
        await makeHodSummaryCall(hod.phone, pendingCount);
      } else {
        console.log(`✅ No pending requests for ${hod.name}`);
      }
    }

    console.log('✅ HOD notification job completed.');
  } catch (error) {
    console.error('❌ Error in HOD notification process:', error);
  }
};
