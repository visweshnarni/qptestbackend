import asyncHandler from 'express-async-handler';
import moment from 'moment-timezone';
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import Class from '../models/Class.js';

/**
 * @desc HOD Dashboard — Department-level summary and pending approvals
 * @route GET /api/hod/dashboard
 * @access Private (HOD)
 */
export const getHodDashboard = asyncHandler(async (req, res) => {
  const hodId = req.user.id;

  // 1️⃣ Fetch HOD details
  const hod = await Employee.findById(hodId).populate('department', 'name').lean();
  if (!hod) {
    res.status(404);
    throw new Error('HOD not found');
  }

  // 2️⃣ Get all faculty under this department
  const departmentFaculty = await Employee.find({
    department: hod.department._id,
    role: 'faculty',
  }).select('name email employeeId');

  const totalFaculty = departmentFaculty.length;

  // 3️⃣ Get all classes under this department
  const deptClasses = await Class.find({ department: hod.department._id }).select('_id name');
  const classIds = deptClasses.map(c => c._id);

  // 4️⃣ Student counts
  const totalStudents = await Student.countDocuments({ class: { $in: classIds } });

  // 5️⃣ Outpass statistics
  const [pendingApprovals, approvedToday, rejectedToday] = await Promise.all([
    Outpass.countDocuments({ status: 'pending_hod' }),
    Outpass.countDocuments({
      status: 'approved',
      hodApprover: hodId,
      updatedAt: { $gte: moment().startOf('day'), $lte: moment().endOf('day') },
    }),
    Outpass.countDocuments({
      status: 'rejected',
      hodApprover: hodId,
      updatedAt: { $gte: moment().startOf('day'), $lte: moment().endOf('day') },
    }),
  ]);

  // 6️⃣ Get recent pending requests for HOD approval
  const pendingRequests = await Outpass.find({ status: 'pending_hod' })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate({
      path: 'student',
      select: 'name rollNumber class parentName primaryParentPhone attendancePercentage',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .populate('facultyApprover', 'name')
    .lean();

  const formattedPending = pendingRequests.map(req => ({
    requestId: req._id,
    studentName: req.student?.name,
    rollNumber: req.student?.rollNumber,
    class: req.student?.class?.name,
    department: req.student?.class?.department?.name,
    reasonCategory: req.reasonCategory,
    reason: req.reason,
    teacherApprover: req.facultyApprover?.name || 'Pending Faculty',
    parentContact: req.student?.primaryParentPhone,
    attendanceAtApply: req.attendanceAtApply,
    attendanceStatus:
      req.attendanceAtApply < 75 ? 'Low Attendance' : 'Normal',
    exitTime: moment(req.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(req.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    requestedAt: moment(req.createdAt).tz('Asia/Kolkata').fromNow(),
    urgency:
      /^emergency$/i.test(req.reasonCategory) ? 'HIGH' : 'NORMAL',
  }));

  // 7️⃣ Urgent Alerts (Emergency)
  const urgentAlerts = await Outpass.find({
    reasonCategory: { $regex: /^emergency$/i },
    status: 'pending_hod',
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate({
      path: 'student',
      select: 'name rollNumber class',
      populate: { path: 'class', select: 'name' },
    })
    .lean();

  const formattedUrgentAlerts = urgentAlerts.map(a => ({
    requestId: a._id,
    message: `Emergency outpass from ${a.student?.name} (${a.student?.rollNumber})`,
    class: a.student?.class?.name,
    timeAgo: moment(a.createdAt).tz('Asia/Kolkata').fromNow(),
  }));

  // 8️⃣ Final Response
  res.status(200).json({
    hodDetails: {
      name: hod.name,
      email: hod.email,
      department: hod.department.name,
      role: hod.role,
      totalFaculty,
      totalStudents,
    },
    stats: {
      pendingApprovals,
      approvedToday,
      rejectedToday,
      totalFaculty,
    },
    recentPendingApprovals: formattedPending,
    urgentAlerts: formattedUrgentAlerts,
  });
});
