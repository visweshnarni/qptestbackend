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
/* --------------------------------------------
   GET STUDENT PROFILES (Faculty / Mentor)
   -------------------------------------------- */
/**
 * @desc Faculty can search students by class, roll number, or view all
 * @route GET /api/faculty/student-profiles
 * @query ?class=ClassName OR ?roll=RollNumber
 * @access Private (Faculty, HOD)
 */
export const getStudentProfiles = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const { class: className, roll } = req.query; // ?class=CSO3A or ?roll=21CS1001

  // Fetch faculty info
  const faculty = await Employee.findById(facultyId)
    .populate('department', 'name')
    .lean();

  if (!faculty) {
    res.status(404);
    throw new Error('Faculty not found');
  }

  // Check if faculty is also a mentor
  const mentorClass = await Class.findOne({ mentors: facultyId })
    .populate('department', 'name')
    .lean();

  const isMentor = !!mentorClass;

  // ✅ 1. Search by Roll Number
  if (roll) {
    const student = await Student.findOne({ rollNumber: roll })
      .populate({
        path: 'class',
        select: 'name year department',
        populate: { path: 'department', select: 'name' },
      })
      .lean();

    if (!student) {
      res.status(404);
      throw new Error('Student not found');
    }

    return res.status(200).json({
      type: 'single',
      student: {
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        phone: student.phone,
        class: student.class?.name,
        year: student.class?.year,
        department: student.class?.department?.name,
        parentName: student.parentName,
        primaryParentPhone: student.primaryParentPhone,
        secondaryParentPhone: student.secondaryParentPhone,
        attendancePercentage: student.attendancePercentage,
        joinedAt: new Date(student.createdAt).toLocaleDateString('en-IN'),
      },
    });
  }

  // ✅ 2. Search by Class Name
  let students = [];
  if (className) {
    const classObj = await Class.findOne({ name: className })
      .populate('department', 'name')
      .lean();

    if (!classObj) {
      res.status(404);
      throw new Error('Class not found');
    }

    // Only allow if faculty belongs to same department
    if (faculty.department._id.toString() !== classObj.department._id.toString()) {
      res.status(403);
      throw new Error('Unauthorized to access this class.');
    }

    students = await Student.find({ class: classObj._id })
      .select('name rollNumber email phone attendancePercentage parentName primaryParentPhone secondaryParentPhone')
      .sort({ rollNumber: 1 })
      .lean();

    return res.status(200).json({
      type: 'class',
      class: classObj.name,
      department: classObj.department.name,
      count: students.length,
      students,
    });
  }

  // ✅ 3. Default: Show all students under faculty’s department (or mentor’s class)
  let query = {};
  if (isMentor) {
    query = { class: mentorClass._id };
  } else {
    const deptClasses = await Class.find({ department: faculty.department._id }).select('_id');
    query = { class: { $in: deptClasses.map(c => c._id) } };
  }

  const deptStudents = await Student.find(query)
    .select('name rollNumber email phone attendancePercentage parentName primaryParentPhone class')
    .populate({
      path: 'class',
      select: 'name department',
      populate: { path: 'department', select: 'name' },
    })
    .sort({ rollNumber: 1 })
    .lean();

  res.status(200).json({
    type: 'list',
    context: isMentor ? 'myclass' : 'department',
    total: deptStudents.length,
    students: deptStudents.map(s => ({
      name: s.name,
      rollNumber: s.rollNumber,
      class: s.class?.name,
      department: s.class?.department?.name,
      phone: s.phone,
      email: s.email,
      attendance: s.attendancePercentage,
      parentName: s.parentName,
      parentContact: s.primaryParentPhone,
    })),
  });
});


/* --------------------------------------------
   GET ALL CLASSES UNDER FACULTY DEPARTMENT
   -------------------------------------------- */
export const getFacultyClasses = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const faculty = await Employee.findById(facultyId)
    .populate('department', 'name')
    .lean();

  if (!faculty) {
    res.status(404);
    throw new Error('Faculty not found');
  }

  // Get all classes in the same department
  const classes = await Class.find({ department: faculty.department._id })
    .select('name year')
    .sort({ year: 1 })
    .lean();

  res.status(200).json({
    department: faculty.department.name,
    total: classes.length,
    classes,
  });
});


/**
 * @desc    Faculty history (past outpasses) with filters, counts and pagination
 * @route   GET /api/faculty/history
 * @access  Private (Faculty, HOD, Mentor)
 *
 * Notes:
 *  - "history" = past/finished outpasses, so we EXCLUDE statuses pending_faculty and pending_hod from summary counts
 *  - Supports filters: status, approvedByMe, rejectedByMe, studentRoll, class (name), myclass (mentor)
 *  - Pagination: page, limit
 *  - Sorting: sort= newest | oldest (default newest)
 */
export const getFacultyHistory = asyncHandler(async (req, res) => {
  const facultyId = req.user.id;
  const {
    status,            // approved | rejected | cancelled | all (default all)
    approvedByMe,      // true | false
    rejectedByMe,      // true | false
    studentRoll,       // exact roll number
    class: className,  // class name e.g., "CSE-3A"
    myclass,           // true => only mentor's class (if mentor)
    sort,              // newest | oldest
    page = 1,
    limit = 20,
  } = req.query;

  // 1. get faculty and mentor-class
  const faculty = await Employee.findById(facultyId).populate('department', 'name').lean();
  if (!faculty) {
    res.status(404);
    throw new Error('Faculty not found');
  }
  const mentorClass = await Class.findOne({ mentors: facultyId }).lean();
  const isMentor = !!mentorClass;

  // 2. build base student list that faculty can view
  // If myclass requested and faculty is mentor -> restrict to that class
  // Else use department classes
  let studentIdsForScope = [];
  if (myclass === 'true' || myclass === '1') {
    if (!isMentor) {
      // no access to myclass filter if not a mentor
      return res.status(403).json({ message: 'Not a mentor / no myclass access.' });
    }
    const classStudents = await Student.find({ class: mentorClass._id }).select('_id').lean();
    studentIdsForScope = classStudents.map(s => s._id);
  } else if (className) {
    // find class by name under faculty department
    const cls = await Class.findOne({ name: className, department: faculty.department._id }).select('_id').lean();
    if (!cls) {
      return res.status(200).json({ summary: {}, count: 0, outpasses: [] });
    }
    const classStudents = await Student.find({ class: cls._id }).select('_id').lean();
    studentIdsForScope = classStudents.map(s => s._id);
  } else {
    // department-wide
    const deptClasses = await Class.find({ department: faculty.department._id }).select('_id').lean();
    const deptStudents = await Student.find({ class: { $in: deptClasses.map(c => c._id) } }).select('_id').lean();
    studentIdsForScope = deptStudents.map(s => s._id);
  }

  // 3. base query for history: exclude pending statuses (these are 'currently processing')
  const baseQuery = {
    student: { $in: studentIdsForScope },
    status: { $nin: ['pending_faculty', 'pending_hod'] }
  };

  // 4. apply status filter if provided
  if (status && status !== 'all') {
    if (status === 'cancelled') baseQuery.status = 'cancelled_by_student';
    else baseQuery.status = status; // 'approved' | 'rejected'
  }

  // 5. studentRoll filter
  if (studentRoll) {
    const student = await Student.findOne({ rollNumber: studentRoll }).select('_id').lean();
    if (!student) {
      return res.status(200).json({ summary: {}, count: 0, outpasses: [] });
    }
    // ensure requested student is within faculty scope
    if (!studentIdsForScope.map(String).includes(String(student._id))) {
      return res.status(403).json({ message: 'You do not have access to this student history.' });
    }
    baseQuery.student = student._id;
  }

  // 6. approvedByMe / rejectedByMe flags
  if (approvedByMe === 'true' || approvedByMe === '1') {
    baseQuery.facultyApprover = facultyId;
    baseQuery.status = 'approved';
  }
  if (rejectedByMe === 'true' || rejectedByMe === '1') {
    baseQuery.facultyApprover = facultyId;
    baseQuery.status = 'rejected';
  }

  // 7. counts (summary) for department/class scope (exclude pending)
  const countBase = { student: { $in: studentIdsForScope }, status: { $nin: ['pending_faculty', 'pending_hod'] } };

  const [ total, approved, rejected, cancelled ] = await Promise.all([
    Outpass.countDocuments(countBase),
    Outpass.countDocuments({ ...countBase, status: 'approved' }),
    Outpass.countDocuments({ ...countBase, status: 'rejected' }),
    Outpass.countDocuments({ ...countBase, status: 'cancelled_by_student' }),
  ]);

  // 8. pagination and sorting
  const pageNum = Math.max(1, parseInt(page, 10));
  const pageLimit = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (pageNum - 1) * pageLimit;
  const sortOrder = sort === 'oldest' ? 1 : -1;

  // 9. fetch outpasses
  const outpasses = await Outpass.find(baseQuery)
    .sort({ createdAt: sortOrder })
    .skip(skip)
    .limit(pageLimit)
    .populate({
      path: 'student',
      select: 'name rollNumber email phone attendancePercentage class parentName primaryParentPhone secondaryParentPhone',
      populate: {
        path: 'class',
        select: 'name department',
        populate: { path: 'department', select: 'name' },
      },
    })
    .populate('facultyApprover', 'name employeeId')
    .populate('hodApprover', 'name employeeId')
    .lean();

  // 10. format list
  const formatted = outpasses.map(o => ({
    requestId: o._id,
    status: o.status === 'cancelled_by_student' ? 'cancelled' : o.status,
    reasonCategory: o.reasonCategory,
    reason: o.reason,
    student: {
      name: o.student?.name,
      rollNumber: o.student?.rollNumber,
      class: o.student?.class?.name,
      department: o.student?.class?.department?.name,
      email: o.student?.email,
      phone: o.student?.phone,
      parentName: o.student?.parentName,
      parentContact: o.student?.primaryParentPhone,
      alternateContact: o.alternateContact || o.student?.secondaryParentPhone || null,
      attendanceAtApply: o.attendanceAtApply,
    },
    exitTime: moment(o.dateFrom).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm'),
    returnTime: moment(o.dateTo).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm'),
    requestedAt: moment(o.createdAt).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm'),
    facultyApprover: o.facultyApprover ? { id: o.facultyApprover._id, name: o.facultyApprover.name } : null,
    hodApprover: o.hodApprover ? { id: o.hodApprover._id, name: o.hodApprover.name } : null,
    rejectionReason: o.rejectionReason || null,
  }));

  // 11. total pages (for pagination)
  const totalMatching = await Outpass.countDocuments(baseQuery);
  const totalPages = Math.ceil(totalMatching / pageLimit);

  res.status(200).json({
    summary: { total, approved, rejected, cancelled },
    meta: { page: pageNum, limit: pageLimit, totalPages, totalMatching },
    count: formatted.length,
    outpasses: formatted,
  });
});