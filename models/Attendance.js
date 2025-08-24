const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: [true, 'Course ID is required']
    },
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: [true, 'Student ID is required']
    },
    sessionId: {
        type: String,
        required: [true, 'Session ID is required']
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'late'],
        default: 'present'
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index to prevent duplicate attendance records for the same session
attendanceSchema.index({ courseId: 1, studentId: 1, sessionId: 1 }, { unique: true });

// Index for better query performance
attendanceSchema.index({ courseId: 1, timestamp: 1 });
attendanceSchema.index({ studentId: 1, timestamp: 1 });
attendanceSchema.index({ timestamp: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
