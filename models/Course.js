const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Course name is required'],
        trim: true
    },
    instructor: {
        type: String,
        required: [true, 'Instructor name is required'],
        trim: true
    },
    schedule: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    qrCode: {
        type: String,
        default: null
    },
    sessionId: {
        type: String,
        default: null
    },
    qrGeneratedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for better query performance
courseSchema.index({ name: 1 });
courseSchema.index({ instructor: 1 });

module.exports = mongoose.model('Course', courseSchema);
