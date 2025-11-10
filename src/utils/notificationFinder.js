import moment from 'moment-timezone';
import Student from '../models/Student.js';
import Employee from '../models/Employee.js';
import TimetableSlot from '../models/TimetableSlot.js ';

/**
 * Finds all faculty members who should be notified about an outpass.
 * @param {object} student - The student applying
 * @param {object} outpass - The outpass object
 * @returns {Array<object>} A list of Employee objects (with name, email, phone)
 */
export const getNotificationTargets = async (student, outpass) => {
  try {
    // 1. Get Outpass Time Details
    const dayOfWeek = moment(outpass.dateFrom).day(); // 0 = Sunday, 1 = Monday...
    const outpassStart = moment(outpass.dateFrom).tz('Asia/Kolkata').format('HH:mm');
    const outpassEnd = moment(outpass.dateTo).tz('Asia/Kolkata').format('HH:mm');

    // 2. Get Student's Mentors and Department
    const studentDetails = await Student.findById(student._id)
      .populate({
        path: 'class',
        select: 'mentors department',
      });

    const mentorIds = studentDetails.class.mentors; // [id1, id2, ...]
    const departmentId = studentDetails.class.department;

    // 3. Find all *other* faculty in the same department
    const otherFaculty = await Employee.find({
      department: departmentId,
      _id: { $nin: mentorIds }, // Exclude mentors (we already have them)
      role: 'faculty',
    }).select('_id');

    const otherFacultyIds = otherFaculty.map(f => f._id);

    // 4. Find which of these "other" faculty are BUSY
    const busySlots = await TimetableSlot.find({
      employee: { $in: otherFacultyIds },
      dayOfWeek: dayOfWeek,
      // Check for any time overlap
      startTime: { $lt: outpassEnd },   // Slot starts before outpass ends
      endTime: { $gt: outpassStart },   // Slot ends after outpass begins
    }).select('employee');

    const busyFacultyIds = busySlots.map(slot => slot.employee.toString());

    // 5. Filter to find the "free" faculty
    const freeFacultyIds = otherFacultyIds.filter(id => 
      !busyFacultyIds.includes(id.toString())
    );

    // 6. Combine Mentors (always notify) + Free Faculty
    const finalTargetIds = [
      ...new Set([
        ...mentorIds.map(id => id.toString()),
        ...freeFacultyIds.map(id => id.toString())
      ])
    ];

    // 7. Get full details for all targets
    const targets = await Employee.find({
      _id: { $in: finalTargetIds }
    }).select('name email phone');

    console.log('Notification Targets:', targets.map(t => t.name));
    return targets;

  } catch (error) {
    console.error('Error finding notification targets:', error);
    return [];
  }
};