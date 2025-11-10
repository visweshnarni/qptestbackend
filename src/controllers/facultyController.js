import asyncHandler from 'express-async-handler';
import moment from 'moment-timezone';
import Outpass from '../models/Outpass.js';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import Class from '../models/Class.js';

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
  const deptStudentCount = await Student.countDocuments({
    department: faculty.department._id,
  });

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
    query.student = { $in: classStudents.map((s) => s._id) };
  } else {
    // Default → department-level
    const deptStudents = await Student.find({ department: faculty.department._id }).select('_id');
    query.student = { $in: deptStudents.map((s) => s._id) };
  }

  const recentRequests = await Outpass.find(query)
    .sort({ createdAt: -1 })
    .limit(5)
    .populate({
      path: 'student',
      select: 'name rollNumber class parentName primaryParentPhone parentEmail',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .lean();

  const formattedRecent = recentRequests.map((r) => ({
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
    parentEmail: r.student?.parentEmail,
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
    .populate('student', 'name rollNumber class')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  const urgentAlerts = urgentRequests.map((u) => ({
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
