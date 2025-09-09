const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
require('dotenv').config({ path: './config.env' });

// Import database connection
const connectDB = require('./config/database');

// Import models
const Course = require('./models/Course');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve student scanner page
app.get('/student', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// Test endpoint for QR code debugging
app.get('/test-qr', (req, res) => {
    const testData = {
        courseId: 'test-course-id',
        timestamp: moment().toISOString(),
        sessionId: uuidv4()
    };
    
    const testUrl = `${req.protocol}://${req.get('host')}/student?data=${encodeURIComponent(JSON.stringify(testData))}`;
    
    res.json({
        message: 'Test QR Code Data',
        qrData: testData,
        url: testUrl,
        instructions: 'Use this URL to test the student scanner: ' + testUrl
    });
});

// Course Management
app.post('/api/courses', async (req, res) => {
    try {
        const { name, instructor, schedule, description } = req.body;
        
        const course = new Course({
            name,
            instructor,
            schedule,
            description
        });
        
        const savedCourse = await course.save();
        res.status(201).json(savedCourse);
    } catch (error) {
        console.error('Error creating course:', error);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ createdAt: -1 });
        res.json(courses);
    } catch (error) {
        console.error('Error fetching courses:', error);
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// Get a single course by ID
app.get('/api/courses/:id', async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        res.json(course);
    } catch (error) {
        console.error('Error fetching course:', error);
        res.status(500).json({ error: 'Failed to fetch course' });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        const courseId = req.params.id;
        
        // Delete the course
        await Course.findByIdAndDelete(courseId);
        
        // Delete related attendance records
        await Attendance.deleteMany({ courseId });
        
        // Remove course from students' courseIds
        await Student.updateMany(
            { courseIds: courseId },
            { $pull: { courseIds: courseId } }
        );
        
        res.json({ message: 'Course deleted successfully' });
    } catch (error) {
        console.error('Error deleting course:', error);
        res.status(500).json({ error: 'Failed to delete course' });
    }
});

// Generate QR Code for a course
app.post('/api/courses/:id/qr-code', async (req, res) => {
    try {
        const courseId = req.params.id;
        const course = await Course.findById(courseId);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        const qrData = {
            courseId,
            timestamp: moment().toISOString(),
            sessionId: uuidv4()
        };

        // Create a URL that students can scan to access the student scanner
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const studentScannerUrl = `${baseUrl}/student?data=${encodeURIComponent(JSON.stringify(qrData))}`;
        
        // Generate QR code with higher error correction and larger size for better mobile scanning
        const qrCodeDataURL = await QRCode.toDataURL(studentScannerUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 300
        });
        
        // Update course with QR code data
        course.qrCode = qrCodeDataURL;
        course.sessionId = qrData.sessionId;
        course.qrGeneratedAt = qrData.timestamp;
        await course.save();
        
        res.json({ qrCode: qrCodeDataURL, sessionId: qrData.sessionId });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Student Management
app.post('/api/students', async (req, res) => {
    try {
        const { name, studentId, email, courseIds } = req.body;
        
        const student = new Student({
            name,
            studentId,
            email: email || '', // Handle empty email
            courseIds: courseIds || []
        });
        
        const savedStudent = await student.save();
        res.status(201).json(savedStudent);
    } catch (error) {
        console.error('Error creating student:', error);
        if (error.code === 11000) {
            res.status(400).json({ error: 'Student ID already exists' });
        } else {
            res.status(400).json({ error: error.message });
        }
    }
});

app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find().populate('courseIds', 'name').sort({ createdAt: -1 });
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// Search for existing student
app.get('/api/students/search', async (req, res) => {
    try {
        const { studentId, email } = req.query;
        
        let query = {};
        if (studentId) query.studentId = studentId;
        if (email) query.email = email;
        
        const student = await Student.findOne(query);
        res.json(student);
    } catch (error) {
        console.error('Error searching for student:', error);
        res.status(500).json({ error: 'Failed to search for student' });
    }
});

app.put('/api/students/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        const { name, email, courseIds } = req.body;
        
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        student.name = name || student.name;
        student.email = email || student.email;
        student.courseIds = courseIds || student.courseIds;
        
        const updatedStudent = await student.save();
        res.json(updatedStudent);
    } catch (error) {
        console.error('Error updating student:', error);
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/students/:id', async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // Delete the student
        await Student.findByIdAndDelete(studentId);
        
        // Delete related attendance records
        await Attendance.deleteMany({ studentId });
        
        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({ error: 'Failed to delete student' });
    }
});

// Attendance Management
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { qrData, studentId } = req.body;
        
        const parsedQRData = JSON.parse(qrData);
        const course = await Course.findById(parsedQRData.courseId);
        const student = await Student.findById(studentId);
        
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }
        
        // Check if student is enrolled in the course
        if (!student.courseIds.includes(course._id)) {
            return res.status(400).json({ error: 'Student not enrolled in this course' });
        }
        
        // Check if QR code is still valid (within 5 minutes)
        const qrTime = moment(parsedQRData.timestamp);
        const currentTime = moment();
        if (currentTime.diff(qrTime, 'minutes') > 5) {
            return res.status(400).json({ error: 'QR code has expired' });
        }
        
        // Check if already marked present for this session
        const existingRecord = await Attendance.findOne({
            courseId: course._id,
            studentId: student._id,
            sessionId: parsedQRData.sessionId
        });
        
        if (existingRecord) {
            return res.status(400).json({ error: 'Attendance already recorded for this session' });
        }
        
        // Record attendance
        const attendanceRecord = new Attendance({
            courseId: course._id,
            studentId: student._id,
            sessionId: parsedQRData.sessionId,
            timestamp: new Date()
        });
        
        const savedRecord = await attendanceRecord.save();
        
        res.json({ 
            message: 'Attendance recorded successfully',
            record: savedRecord
        });
        
    } catch (error) {
        console.error('Error recording attendance:', error);
        if (error.name === 'ValidationError') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(400).json({ error: 'Invalid QR code data' });
        }
    }
});

// Get attendance records
app.get('/api/attendance', async (req, res) => {
    try {
        const { courseId, date } = req.query;
        let query = {};
        
        if (courseId) {
            query.courseId = courseId;
        }
        
        if (date) {
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();
            query.timestamp = { $gte: startDate, $lte: endDate };
        }
        
        const records = await Attendance.find(query)
            .populate('courseId', 'name')
            .populate('studentId', 'name studentId')
            .sort({ timestamp: -1 });
        
        res.json(records);
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

// Generate attendance report
app.get('/api/reports/attendance/:courseId', async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const { date } = req.query;
        
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        let dateFilter = {};
        if (date) {
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();
            dateFilter = { timestamp: { $gte: startDate, $lte: endDate } };
        }
        
        // Get attendance records for this course
        const attendanceRecords = await Attendance.find({
            courseId,
            ...dateFilter
        }).populate('studentId', 'name studentId');
        
        // Get enrolled students
        const enrolledStudents = await Student.find({ courseIds: courseId });
        
        const presentStudents = attendanceRecords.map(record => ({
            id: record.studentId._id,
            name: record.studentId.name,
            studentId: record.studentId.studentId,
            timestamp: record.timestamp
        }));
        
        const presentStudentIds = presentStudents.map(student => student.id.toString());
        const absentStudents = enrolledStudents.filter(student => 
            !presentStudentIds.includes(student._id.toString())
        );
        
        const report = {
            course: {
                id: course._id,
                name: course.name,
                instructor: course.instructor
            },
            date: date || moment().format('YYYY-MM-DD'),
            totalEnrolled: enrolledStudents.length,
            present: presentStudents.length,
            absent: absentStudents.length,
            attendanceRate: enrolledStudents.length > 0 ? 
                ((presentStudents.length / enrolledStudents.length) * 100).toFixed(2) : 0,
            presentStudents,
            absentStudents: absentStudents.map(student => ({
                id: student._id,
                name: student.name,
                studentId: student.studentId
            }))
        };
        
        res.json(report);
    } catch (error) {
        console.error('Error generating attendance report:', error);
        res.status(500).json({ error: 'Failed to generate attendance report' });
    }
});

// Get all reports
app.get('/api/reports', async (req, res) => {
    try {
        const { date } = req.query;
        
        const courses = await Course.find();
        const reports = [];
        
        for (const course of courses) {
            let dateFilter = {};
            if (date) {
                const startDate = moment(date).startOf('day').toDate();
                const endDate = moment(date).endOf('day').toDate();
                dateFilter = { timestamp: { $gte: startDate, $lte: endDate } };
            }
            
            const attendanceRecords = await Attendance.find({
                courseId: course._id,
                ...dateFilter
            });
            
            const enrolledStudents = await Student.find({ courseIds: course._id });
            const presentCount = attendanceRecords.length;
            
            reports.push({
                courseId: course._id,
                courseName: course.name,
                instructor: course.instructor,
                totalEnrolled: enrolledStudents.length,
                present: presentCount,
                absent: enrolledStudents.length - presentCount,
                attendanceRate: enrolledStudents.length > 0 ? 
                    ((presentCount / enrolledStudents.length) * 100).toFixed(2) : 0
            });
        }
        
        res.json(reports);
    } catch (error) {
        console.error('Error generating reports:', error);
        res.status(500).json({ error: 'Failed to generate reports' });
    }
});

// Download report as CSV
app.get('/api/reports/download/:courseId', async (req, res) => {
    try {
        const courseId = req.params.courseId;
        const { date } = req.query;
        
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }
        
        let dateFilter = {};
        if (date) {
            const startDate = moment(date).startOf('day').toDate();
            const endDate = moment(date).endOf('day').toDate();
            dateFilter = { timestamp: { $gte: startDate, $lte: endDate } };
        }
        
        // Get attendance records for this course
        const attendanceRecords = await Attendance.find({
            courseId,
            ...dateFilter
        }).populate('studentId', 'name studentId email');
        
        // Get enrolled students
        const enrolledStudents = await Student.find({ courseIds: courseId });
        
        const presentStudents = attendanceRecords.map(record => ({
            name: record.studentId.name,
            studentId: record.studentId.studentId,
            email: record.studentId.email,
            status: 'Present',
            timestamp: moment(record.timestamp).format('YYYY-MM-DD HH:mm:ss')
        }));
        
        const presentStudentIds = presentStudents.map(student => student.studentId);
        const absentStudents = enrolledStudents.filter(student => 
            !presentStudentIds.includes(student.studentId)
        ).map(student => ({
            name: student.name,
            studentId: student.studentId,
            email: student.email,
            status: 'Absent',
            timestamp: ''
        }));
        
        // Combine present and absent students
        const allStudents = [...presentStudents, ...absentStudents];
        
        // Generate CSV content
        const csvHeaders = ['Name', 'Student ID', 'Email', 'Status', 'Timestamp'];
        const csvContent = [
            csvHeaders.join(','),
            ...allStudents.map(student => [
                `"${student.name}"`,
                `"${student.studentId}"`,
                `"${student.email}"`,
                `"${student.status}"`,
                `"${student.timestamp}"`
            ].join(','))
        ].join('\n');
        
        // Set response headers for CSV download
        const fileName = `attendance_${course.name.replace(/\s+/g, '_')}_${date || moment().format('YYYY-MM-DD')}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csvContent);
        
    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).json({ error: 'Failed to download report' });
    }
});

// Get student attendance percentages
app.get('/api/students/attendance-percentages', async (req, res) => {
    try {
        const { courseId, date } = req.query;
        
        // Get all students
        const students = await Student.find();
        const studentPercentages = [];
        
        for (const student of students) {
            let totalSessions = 0;
            let attendedSessions = 0;
            
            // Get all courses the student is enrolled in
            const enrolledCourses = await Course.find({ _id: { $in: student.courseIds } });
            
            for (const course of enrolledCourses) {
                // Count total sessions for this course (unique sessionIds)
                const totalSessionsForCourse = await Attendance.distinct('sessionId', { courseId: course._id });
                totalSessions += totalSessionsForCourse.length;
                
                // Count sessions this student attended
                let dateFilter = {};
                if (date) {
                    const startDate = moment(date).startOf('day').toDate();
                    const endDate = moment(date).endOf('day').toDate();
                    dateFilter = { timestamp: { $gte: startDate, $lte: endDate } };
                }
                
                const attendedSessionsForCourse = await Attendance.distinct('sessionId', {
                    courseId: course._id,
                    studentId: student._id,
                    ...dateFilter
                });
                attendedSessions += attendedSessionsForCourse.length;
            }
            
            const attendancePercentage = totalSessions > 0 ? 
                ((attendedSessions / totalSessions) * 100).toFixed(2) : 0;
            
            studentPercentages.push({
                studentId: student._id,
                name: student.name,
                studentIdNumber: student.studentId,
                email: student.email,
                totalSessions,
                attendedSessions,
                attendancePercentage: parseFloat(attendancePercentage),
                enrolledCourses: enrolledCourses.length
            });
        }
        
        // Sort by attendance percentage (highest first)
        studentPercentages.sort((a, b) => b.attendancePercentage - a.attendancePercentage);
        
        res.json(studentPercentages);
    } catch (error) {
        console.error('Error getting student attendance percentages:', error);
        res.status(500).json({ error: 'Failed to get attendance percentages' });
    }
});

// Download all reports as CSV
app.get('/api/reports/download-all', async (req, res) => {
    try {
        const { date } = req.query;
        
        const courses = await Course.find();
        let allAttendanceData = [];
        
        for (const course of courses) {
            let dateFilter = {};
            if (date) {
                const startDate = moment(date).startOf('day').toDate();
                const endDate = moment(date).endOf('day').toDate();
                dateFilter = { timestamp: { $gte: startDate, $lte: endDate } };
            }
            
            const attendanceRecords = await Attendance.find({
                courseId: course._id,
                ...dateFilter
            }).populate('studentId', 'name studentId email');
            
            const enrolledStudents = await Student.find({ courseIds: course._id });
            
            const presentStudents = attendanceRecords.map(record => ({
                courseName: course.name,
                instructor: course.instructor,
                name: record.studentId.name,
                studentId: record.studentId.studentId,
                email: record.studentId.email,
                status: 'Present',
                timestamp: moment(record.timestamp).format('YYYY-MM-DD HH:mm:ss')
            }));
            
            const presentStudentIds = presentStudents.map(student => student.studentId);
            const absentStudents = enrolledStudents.filter(student => 
                !presentStudentIds.includes(student.studentId)
            ).map(student => ({
                courseName: course.name,
                instructor: course.instructor,
                name: student.name,
                studentId: student.studentId,
                email: student.email,
                status: 'Absent',
                timestamp: ''
            }));
            
            allAttendanceData.push(...presentStudents, ...absentStudents);
        }
        
        // Generate CSV content
        const csvHeaders = ['Course', 'Instructor', 'Name', 'Student ID', 'Email', 'Status', 'Timestamp'];
        const csvContent = [
            csvHeaders.join(','),
            ...allAttendanceData.map(student => [
                `"${student.courseName}"`,
                `"${student.instructor}"`,
                `"${student.name}"`,
                `"${student.studentId}"`,
                `"${student.email}"`,
                `"${student.status}"`,
                `"${student.timestamp}"`
            ].join(','))
        ].join('\n');
        
        // Set response headers for CSV download
        const fileName = `all_attendance_reports_${date || moment().format('YYYY-MM-DD')}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csvContent);
        
    } catch (error) {
        console.error('Error downloading all reports:', error);
        res.status(500).json({ error: 'Failed to download reports' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Efficient and Effective Class Attendance System is ready!');
    console.log('MongoDB integration active');
});
