import asyncHandler from 'express-async-handler';
import moment from 'moment-timezone';
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import Class from '../models/Class.js';
import { notifyPendingHodRequests } from '../utils/hodNotification/hodNotificationService.js';

/**
 * @desc Faculty or Mentor Dashboard
 * @route GET /api/faculty/dashboard
 * @access Private (Faculty / Mentor)
 */
export const getFacultyDashboard = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const { sort } = req.query; // ?sort=myclass for mentors

  // --- 1️⃣ Fetch faculty data ---
  const faculty = await Employee.findById(facultyId)
    .populate('department', 'name')
    .lean();

  if (!faculty) {
    res.status(404);
    throw new Error('Faculty not found');
  }

  // --- 2️⃣ Check if faculty is also a mentor ---
  const mentorClass = await Class.findOne({ mentors: facultyId })
    .populate('department', 'name')
    .lean();

  const isMentor = !!mentorClass;

  // --- 3️⃣ Count students ---
  // Get all classes under this faculty’s department
  const departmentClasses = await Class.find({ department: faculty.department._id }).select('_id');

  // Count all students in that department
  const deptStudentCount = await Student.countDocuments({
    class: { $in: departmentClasses.map(c => c._id) },
  });

  // Count students under this mentor’s class (if applicable)
  let classStudentCount = 0;
  if (isMentor) {
    classStudentCount = await Student.countDocuments({ class: mentorClass._id });
  }

  // --- 4️⃣ Outpass statistics (faculty-specific) ---
  const [pendingRequests, approvedRequests, rejectedRequests] = await Promise.all([
    Outpass.countDocuments({
      status: 'pending_faculty',
      notifiedFaculty: { $in: [facultyId] },
    }),
    Outpass.countDocuments({
      status: 'approved',
      facultyApprover: facultyId,
    }),
    Outpass.countDocuments({
      status: 'rejected',
      facultyApprover: facultyId,
    }),
  ]);

  // --- 5️⃣ Query recent pending requests ---
  const query = { status: 'pending_faculty' };

  if (sort === 'myclass' && isMentor) {
    // Mentor’s class only
    const classStudents = await Student.find({ class: mentorClass._id }).select('_id');
    query.student = { $in: classStudents.map(s => s._id) };
  } else {
    // Default → department-level
    const deptStudents = await Student.find({
      class: { $in: departmentClasses.map(c => c._id) },
    }).select('_id');
    query.student = { $in: deptStudents.map(s => s._id) };
  }

  const recentRequests = await Outpass.find(query)
    .sort({ createdAt: -1 })
    .limit(5)
    .populate({
      path: 'student',
      select: 'name rollNumber parentName primaryParentPhone class',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .lean();

  const formattedRecent = recentRequests.map(r => ({
    requestId: r._id,
    studentName: r.student?.name,
    rollNumber: r.student?.rollNumber,
    class: r.student?.class?.name,
    department: r.student?.class?.department?.name,
    reasonCategory: r.reasonCategory,
    reason: r.reason,
    alternateContact: r.alternateContact || null,
    parentName: r.student?.parentName,
    parentPhone: r.student?.primaryParentPhone,
    exitTime: moment(r.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(r.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    requestedAt: moment(r.createdAt).tz('Asia/Kolkata').fromNow(),
    status: r.status,
  }));

  // --- 6️⃣ Urgent alerts (Emergency requests) ---
  const urgentRequests = await Outpass.find({
    reasonCategory: { $regex: /^emergency$/i },
    status: { $in: ['pending_faculty', 'pending_hod'] },
  })
    .populate({
      path: 'student',
      select: 'name rollNumber class',
      populate: { path: 'class', select: 'name' },
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const urgentAlerts = urgentRequests.map(u => ({
    requestId: u._id,
    message: `Emergency request from ${u.student?.name} (${u.student?.rollNumber})`,
    class: u.student?.class?.name,
    timeAgo: moment(u.createdAt).tz('Asia/Kolkata').fromNow(),
  }));

  // --- 7️⃣ Final Response ---
  res.status(200).json({
    facultyDetails: {
      name: faculty.name,
      email: faculty.email,
      phone: faculty.phone,
      department: faculty.department?.name,
      role: faculty.role,
      isMentor,
      mentorClass: mentorClass ? mentorClass.name : null,
      classStudentCount,
      deptStudentCount,
    },
    stats: {
      pendingRequests,
      approvedRequests,
      rejectedRequests,
    },
    recentPendingRequests: formattedRecent,
    urgentAlerts,
  });
});



/* --------------------------------------------
   GET FACULTY PENDING REQUESTS
   -------------------------------------------- */
export const getPendingRequests = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const { filter } = req.query; // ?filter=myclass or ?filter=all

  const faculty = await Employee.findById(facultyId).populate('department', 'name').lean();
  if (!faculty) throw new Error('Faculty not found');

  const mentorClass = await Class.findOne({ mentors: facultyId }).populate('department', 'name').lean();
  const isMentor = !!mentorClass;

  const query = { status: 'pending_faculty' };
  if (filter === 'myclass' && isMentor) {
    const classStudents = await Student.find({ class: mentorClass._id }).select('_id');
    query.student = { $in: classStudents.map(s => s._id) };
  } else {
    const deptClasses = await Class.find({ department: faculty.department._id }).select('_id');
    const deptStudents = await Student.find({ class: { $in: deptClasses.map(c => c._id) } }).select('_id');
    query.student = { $in: deptStudents.map(s => s._id) };
  }

  const outpasses = await Outpass.find(query)
    .populate({
      path: 'student',
      select: 'name rollNumber email phone attendancePercentage class parentName primaryParentPhone secondaryParentPhone',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .sort({ createdAt: -1 })
    .lean();

  const formattedList = outpasses.map(o => ({
    requestId: o._id,
    studentName: o.student?.name,
    rollNumber: o.student?.rollNumber,
    email: o.student?.email,
    phone: o.student?.phone,
    class: o.student?.class?.name,
    department: o.student?.class?.department?.name,
    reasonCategory: o.reasonCategory,
    reason: o.reason,
    attendanceAtApply: o.attendanceAtApply,
    lowAttendance: o.attendanceAtApply < 75,
    parentName: o.student?.parentName,
    parentContact: o.student?.primaryParentPhone,
    alternateContact: o.alternateContact || o.student?.secondaryParentPhone || null,
    exitTime: moment(o.dateFrom).tz('Asia/Kolkata').format('h:mm A'),
    returnTime: moment(o.dateTo).tz('Asia/Kolkata').format('h:mm A'),
    requestedAt: moment(o.createdAt).tz('Asia/Kolkata').fromNow(),
    isEmergency: /^emergency$/i.test(o.reasonCategory),
    parentVerified: o.parentContactVerified?.status || false,
  }));

  const pendingCount = formattedList.length;
  const urgentCount = formattedList.filter(r => r.isEmergency).length;

  res.status(200).json({
    summary: { pending: pendingCount, urgent: urgentCount },
    requests: formattedList,
  });
});

/* --------------------------------------------
   FACULTY APPROVE / REJECT OUTPASS
   -------------------------------------------- */
export const handleFacultyApproval = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const { id } = req.params;
  const { action, rejectionReason, parentVerified } = req.body;

  const outpass = await Outpass.findById(id).populate('student', 'attendancePercentage');
  if (!outpass) throw new Error('Outpass not found');
  if (outpass.status !== 'pending_faculty')
    throw new Error('Outpass is not pending faculty approval.');

  // Manual parent verification (if low attendance)
  if (parentVerified) {
    outpass.parentContactVerified = {
      status: true,
      by: facultyId,
      at: new Date(),
    };
  }

 if (action === 'approve') {
  outpass.status = 'pending_hod';
  outpass.facultyApprover = facultyId;

  // ✅ Trigger initial notification to HOD immediately
  notifyPendingHodRequests();  // async trigger, non-blocking
}else if (action === 'reject') {
    outpass.status = 'rejected';
    outpass.facultyApprover = facultyId;
    outpass.rejectionReason = rejectionReason || 'Rejected by faculty';
  } else {
    throw new Error('Invalid action. Must be "approve" or "reject".');
  }

  await outpass.save();

  res.status(200).json({
    message: `Outpass ${action === 'approve' ? 'approved and sent to HOD' : 'rejected'} successfully.`,
    outpassId: outpass._id,
    status: outpass.status,
  });
});