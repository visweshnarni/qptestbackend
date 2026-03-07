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
      status: { $in: ['approved', 'exited'] }, // ✅ Include exited as approved
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
    attendanceStatus: req.attendanceAtApply < 75 ? 'Low Attendance' : 'Normal',
    exitTime: moment(req.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(req.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    requestedAt: moment(req.createdAt).tz('Asia/Kolkata').fromNow(),
    urgency: /^emergency$/i.test(req.reasonCategory) ? 'HIGH' : 'NORMAL',
    
    // ✅ Pass the new ML Decisions to the HOD
    mlDecision: req.mlDecision,
    mlExplanation: req.mlExplanation,

    // ✅ Map the new Parent Verification schema
    parentVerification: {
      status: req.parentVerification?.status === 'approved',
      verifiedBy: req.parentVerification?.verifiedBy || 'system', // ivr or faculty
      verifiedAt: req.parentVerification?.verifiedAt
        ? moment(req.parentVerification.verifiedAt).tz('Asia/Kolkata').format('DD MMM, h:mm A')
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
    .lean();

  const formattedUrgentAlerts = urgentAlerts.map(a => ({
    requestId: a._id,
    message: `Emergency outpass from ${a.student?.name} (${a.student?.rollNumber})`,
    class: a.student?.class?.name,
    timeAgo: moment(a.createdAt).tz('Asia/Kolkata').fromNow(),
    parentVerified: a.parentVerification?.status === 'approved', // ✅ Mapped to new schema
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
  const { category } = req.query; 

  // 1️⃣ Validate HOD
  const hod = await Employee.findById(hodId).populate('department', 'name').lean();
  if (!hod) throw new Error('HOD not found');

  // 2️⃣ Fetch all classes in HOD’s department
  const deptClasses = await Class.find({ department: hod.department._id }).select('_id');
  const classIds = deptClasses.map(c => c._id);

  // 3️⃣ Build query
  const query = { status: 'pending_hod' };
  query['student'] = { $exists: true };

  if (category && category !== 'all') {
    query.reasonCategory = { $regex: new RegExp(`^${category}$`, 'i') };
  }

  // 4️⃣ Fetch outpasses under this department
  const outpasses = await Outpass.find(query)
    .populate({
      path: 'student',
      match: { class: { $in: classIds } },
      select: 'name rollNumber attendancePercentage class primaryParentPhone',
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

  if (category && category !== 'all' && deptOutpasses.length === 0) {
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
    parentContact: o.student?.primaryParentPhone,
    reasonCategory: o.reasonCategory,
    reason: o.reason,
    exitTime: moment(o.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(o.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    requestedAgo: moment(o.createdAt).tz('Asia/Kolkata').fromNow(),
    timeInHodQueue: moment(o.updatedAt || o.createdAt).tz('Asia/Kolkata').fromNow(),
    isEmergency: /^emergency$/i.test(o.reasonCategory),

    // ✅ New Fields for ML and Parent Verification
    mlDecision: o.mlDecision,
    mlExplanation: o.mlExplanation,
    parentVerification: {
      status: o.parentVerification?.status === 'approved',
      verifiedBy: o.parentVerification?.verifiedBy || 'system',
      verifiedAt: o.parentVerification?.verifiedAt
        ? moment(o.parentVerification.verifiedAt).tz('Asia/Kolkata').format('DD MMM, h:mm A')
        : null,
    },
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

/**
 * @desc Bulk approve outpass requests by HOD
 * @route PUT /api/hod/outpass/bulk-approve
 * @access Private (HOD)
 */
export const bulkApproveOutpasses = asyncHandler(async (req, res) => {
  const hodId = req.user.id;
  const { requestIds } = req.body;

  if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
    return res.status(400).json({ message: 'No request IDs provided for bulk approval.' });
  }

  // Update all matching outpasses that are currently pending HOD approval
  const result = await Outpass.updateMany(
    {
      _id: { $in: requestIds },
      status: 'pending_hod'
    },
    {
      $set: {
        status: 'approved',
        hodApprover: hodId,
      }
    }
  );

  res.status(200).json({
    message: `Successfully approved ${result.modifiedCount} outpass requests.`,
    approvedCount: result.modifiedCount
  });
});

/* --------------------------------------------
   HOD DEPARTMENT REPORTS
   -------------------------------------------- */
/**
 * @desc Generate department-level reports for HOD
 * @route GET /api/hod/reports
 * @query ?range=this_month|overall
 * @access Private (HOD)
 */
export const getHodReports = asyncHandler(async (req, res) => {
  const hodId = req.user.id;
  const { range } = req.query; // ?range=this_month or ?range=overall

  // 1️⃣ Validate HOD
  const hod = await Employee.findById(hodId).populate('department', 'name').lean();
  if (!hod) {
    res.status(404);
    throw new Error('HOD not found');
  }

  // 2️⃣ Get department faculty list
  const facultyList = await Employee.find({
    department: hod.department._id,
    role: 'faculty',
  })
    .select('_id name email')
    .lean();

  const facultyIds = facultyList.map(f => f._id);

  // 3️⃣ Time range filter (if this_month)
  const dateFilter = {};
  if (range === 'this_month') {
    // ✅ ADDED .tz('Asia/Kolkata') to ensure accurate month boundaries for India
    const startOfMonth = moment().tz('Asia/Kolkata').startOf('month').toDate();
    dateFilter.createdAt = { $gte: startOfMonth };
  }

  // 4️⃣ Fetch all department outpasses
  const departmentOutpasses = await Outpass.find({
    facultyApprover: { $in: facultyIds },
    ...dateFilter,
  })
    .populate('facultyApprover', 'name')
    .lean();

  const totalRequests = departmentOutpasses.length;
  // ✅ Include both 'approved' and 'exited' as successful approvals
  const approvedCount = departmentOutpasses.filter(o => ['approved', 'exited'].includes(o.status)).length;
  const rejectedCount = departmentOutpasses.filter(o => o.status === 'rejected').length;

  // 5️⃣ Calculate average approval time
  const approvedOutpasses = departmentOutpasses.filter(
    o => ['approved', 'exited'].includes(o.status) && o.createdAt && o.updatedAt
  );
  
  const avgApprovalTimeMins =
    approvedOutpasses.length > 0
      ? Math.round(
          approvedOutpasses.reduce((sum, o) => sum + (new Date(o.updatedAt) - new Date(o.createdAt)) / 60000, 0) /
            approvedOutpasses.length
        )
      : 0;

  // 6️⃣ Faculty performance breakdown
  const performance = facultyList.map(fac => {
    const fOutpasses = departmentOutpasses.filter(o => o.facultyApprover?._id?.toString() === fac._id.toString());
    const total = fOutpasses.length;
    // ✅ Include both 'approved' and 'exited' for individual faculty stats
    const approved = fOutpasses.filter(o => ['approved', 'exited'].includes(o.status)).length;
    const rejected = fOutpasses.filter(o => o.status === 'rejected').length;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

    return {
      name: fac.name,
      totalRequests: total,
      approved,
      rejected,
      approvalRate: `${approvalRate}%`,
    };
  });

  // Sort descending by total requests
  performance.sort((a, b) => b.totalRequests - a.totalRequests);

  // 7️⃣ Response
  res.status(200).json({
    department: hod.department.name,
    timeRange: range === 'this_month' ? 'This Month' : 'Overall',
    stats: {
      totalRequests,
      approved: approvedCount,
      rejected: rejectedCount,
      avgApprovalTime: `${avgApprovalTimeMins} mins`,
    },
    performance,
  });
});

/**
 * @desc    HOD Decision History - view processed outpasses, approval stats, and filtering
 * @route   GET /api/hod/history
 * @access  Private (HOD)
 *
 * Query Parameters:
 *  - status=approved|rejected|all
 *  - sort=newest|oldest (default newest)
 *  - page, limit
 */
export const getHodHistory = asyncHandler(async (req, res) => {
  const hodId = req.user.id;
  const { status = 'all', sort = 'newest', page = 1, limit = 20 } = req.query;

  // 1️⃣ Get HOD details and department
  const hod = await Employee.findById(hodId).populate('department', 'name').lean();
  if (!hod || hod.role !== 'hod') {
    res.status(403);
    throw new Error('Access denied. Only HODs can view this.');
  }

  // 2️⃣ Get all students in HOD's department
  const deptClasses = await Class.find({ department: hod.department._id }).select('_id').lean();
  const deptStudents = await Student.find({ class: { $in: deptClasses.map(c => c._id) } })
    .select('_id')
    .lean();
  const studentIds = deptStudents.map(s => s._id);

  // 3️⃣ Base query — only past decisions (approved/rejected)
  const baseQuery = {
    student: { $in: studentIds },
    status: { $in: ['approved', 'rejected'] },
    hodApprover: hodId
  };

  // 4️⃣ Apply status filter
  if (status && status !== 'all') {
    baseQuery.status = status;
  }

  // 5️⃣ Summary counts
  const [totalProcessed, approvedCount, rejectedCount] = await Promise.all([
    Outpass.countDocuments({ hodApprover: hodId, status: { $in: ['approved', 'rejected'] } }),
    Outpass.countDocuments({ hodApprover: hodId, status: 'approved' }),
    Outpass.countDocuments({ hodApprover: hodId, status: 'rejected' }),
  ]);

  const approvalRate =
    totalProcessed > 0 ? Math.round((approvedCount / totalProcessed) * 100) : 0;

  // 6️⃣ Pagination setup
  const pageNum = Math.max(1, parseInt(page, 10));
  const pageLimit = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (pageNum - 1) * pageLimit;
  const sortOrder = sort === 'oldest' ? 1 : -1;

  // 7️⃣ Fetch HOD decisions
  const outpasses = await Outpass.find(baseQuery)
    .sort({ updatedAt: sortOrder })
    .skip(skip)
    .limit(pageLimit)
    .populate({
      path: 'student',
      select: 'name rollNumber class',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .populate('facultyApprover', 'name employeeId')
    .lean();

  // 8️⃣ Format result list for frontend
  const formatted = outpasses.map(o => ({
    requestId: o._id,
    studentName: o.student?.name,
    rollNumber: o.student?.rollNumber,
    class: o.student?.class?.name,
    department: o.student?.class?.department?.name,
    facultyApprover: o.facultyApprover ? o.facultyApprover.name : 'N/A',
    reasonCategory: o.reasonCategory,
    reason: o.reason,
    decision: o.status, // approved | rejected
    rejectionReason: o.rejectionReason || null,
    processedOn: moment(o.updatedAt).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm'),
  }));

  // 9️⃣ Pagination metadata
  const totalMatching = await Outpass.countDocuments(baseQuery);
  const totalPages = Math.ceil(totalMatching / pageLimit);

  // 🔟 Send response
  res.status(200).json({
    summary: {
      totalProcessed,
      approved: approvedCount,
      rejected: rejectedCount,
      approvalRate: `${approvalRate}%`,
    },
    meta: {
      page: pageNum,
      limit: pageLimit,
      totalPages,
      totalMatching,
    },
    count: formatted.length,
    outpasses: formatted,
  });
});