import asyncHandler from 'express-async-handler';
import moment from 'moment-timezone';
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import Class from '../models/Class.js';

/**
 * @desc HOD Dashboard — Department-level summary, pending approvals, parent verifications
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
    .populate('parentContactVerified.by', 'name role') // ✅ Populate who verified
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
    urgency: /^emergency$/i.test(req.reasonCategory) ? 'HIGH' : 'NORMAL',

    // ✅ Parent Verification Info
    parentVerification: {
      status: req.parentContactVerified?.status || false,
      verifiedBy: req.parentContactVerified?.by?.name || null,
      verifierRole: req.parentContactVerified?.by?.role || null,
      verifiedAt: req.parentContactVerified?.at
        ? moment(req.parentContactVerified.at).tz('Asia/Kolkata').format('DD MMM, h:mm A')
        : null,
    },
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
    .populate('parentContactVerified.by', 'name')
    .lean();

  const formattedUrgentAlerts = urgentAlerts.map(a => ({
    requestId: a._id,
    message: `Emergency outpass from ${a.student?.name} (${a.student?.rollNumber})`,
    class: a.student?.class?.name,
    timeAgo: moment(a.createdAt).tz('Asia/Kolkata').fromNow(),
    parentVerified: a.parentContactVerified?.status || false, // ✅ Quick check for alert cards
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


/* --------------------------------------------
   GET HOD PENDING APPROVALS
   -------------------------------------------- */
/**
 * @desc Get all outpass requests awaiting HOD approval
 * @route GET /api/hod/pending-approvals
 * @query ?category=Emergency|Medical|Academic etc.
 * @access Private (HOD)
 */
export const getPendingHodApprovals = asyncHandler(async (req, res) => {
  const hodId = req.user.id;
  const { category } = req.query; // ?category=Emergency

  // 1️⃣ Validate HOD
  const hod = await Employee.findById(hodId).populate('department', 'name').lean();
  if (!hod) throw new Error('HOD not found');

  // 2️⃣ Fetch all classes in HOD’s department
  const deptClasses = await Class.find({ department: hod.department._id }).select('_id');
  const classIds = deptClasses.map(c => c._id);

  // 3️⃣ Build query
  const query = { status: 'pending_hod' };
  query['student'] = { $exists: true };

  if (category) {
    query.reasonCategory = { $regex: new RegExp(`^${category}$`, 'i') };
  }

  // 4️⃣ Fetch outpasses under this department
  const outpasses = await Outpass.find(query)
    .populate({
      path: 'student',
      match: { class: { $in: classIds } },
      select: 'name rollNumber attendancePercentage class',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .populate('facultyApprover', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  // Filter outpasses belonging to other departments
  const deptOutpasses = outpasses.filter(o => o.student);

  if (category && deptOutpasses.length === 0) {
    return res.status(404).json({ message: `No pending outpasses found for category "${category}"` });
  }

  // 5️⃣ Format list
  const formattedList = deptOutpasses.map(o => ({
    requestId: o._id,
    studentName: o.student?.name,
    rollNumber: o.student?.rollNumber,
    class: o.student?.class?.name,
    department: o.student?.class?.department?.name,
    facultyApprovedBy: o.facultyApprover?.name || 'N/A',
    facultyApprovedAt: o.updatedAt ? moment(o.updatedAt).tz('Asia/Kolkata').fromNow() : null,
    attendanceAtApply: o.attendanceAtApply,
    attendanceStatus: o.attendanceAtApply < 75 ? 'Low Attendance' : 'Normal',
    reasonCategory: o.reasonCategory,
    reason: o.reason,
    exitTime: moment(o.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(o.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    requestedAgo: moment(o.createdAt).tz('Asia/Kolkata').fromNow(),
    timeInHodQueue: moment(o.updatedAt || o.createdAt).tz('Asia/Kolkata').fromNow(),
    isEmergency: /^emergency$/i.test(o.reasonCategory),
  }));

  const totalPending = formattedList.length;
  const urgentCount = formattedList.filter(r => r.isEmergency).length;

  res.status(200).json({
    summary: {
      totalPending,
      urgentCount,
      department: hod.department.name,
    },
    requests: formattedList,
  });
});

/* --------------------------------------------
   HOD APPROVE / REJECT OUTPASS
   -------------------------------------------- */
/**
 * @desc Approve or reject outpass by HOD
 * @route PUT /api/hod/outpass/:id/action
 * @access Private (HOD)
 */
export const handleHodApproval = asyncHandler(async (req, res) => {
  const hodId = req.user.id;
  const { id } = req.params;
  const { action, rejectionReason } = req.body;

  const outpass = await Outpass.findById(id)
    .populate('student', 'name rollNumber')
    .populate('facultyApprover', 'name')
    .lean();

  if (!outpass) throw new Error('Outpass not found');
  if (outpass.status !== 'pending_hod') throw new Error('Outpass is not pending HOD approval.');

  const update = { hodApprover: hodId };

  if (action === 'approve') {
    update.status = 'approved';
  } else if (action === 'reject') {
    update.status = 'rejected';
    update.rejectionReason = rejectionReason || 'Rejected by HOD';
  } else {
    throw new Error('Invalid action. Must be "approve" or "reject".');
  }

  await Outpass.findByIdAndUpdate(id, update, { new: true });

  res.status(200).json({
    message: `Outpass ${action === 'approve' ? 'approved' : 'rejected'} successfully.`,
    outpassId: id,
    status: update.status,
    hodApprover: hodId,
  });
});