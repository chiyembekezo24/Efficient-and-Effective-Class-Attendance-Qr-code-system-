const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

// Import models
const Course = require('./models/Course');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');

async function setupDatabase() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('✅ MongoDB connected successfully!');
        
        // Check if database is empty
        const courseCount = await Course.countDocuments();
        const studentCount = await Student.countDocuments();
        const attendanceCount = await Attendance.countDocuments();
        
        console.log('\n📊 Database Status:');
        console.log(`   Courses: ${courseCount}`);
        console.log(`   Students: ${studentCount}`);
        console.log(`   Attendance Records: ${attendanceCount}`);
        
        if (courseCount === 0 && studentCount === 0) {
            console.log('\n🎯 Database is empty. You can start by:');
            console.log('   1. Adding courses through the web interface');
            console.log('   2. Adding students through the web interface');
            console.log('   3. Generating QR codes for attendance tracking');
        } else {
            console.log('\n🎯 Database contains existing data.');
        }
        
        // Test database operations
        console.log('\n🧪 Testing database operations...');
        
        // Test creating a sample course
        const testCourse = new Course({
            name: 'Test Course',
            instructor: 'Test Instructor',
            schedule: 'Mon/Wed/Fri 9:00 AM',
            description: 'This is a test course for verification purposes'
        });
        
        await testCourse.save();
        console.log('✅ Sample course created successfully');
        
        // Test creating a sample student
        const testStudent = new Student({
            name: 'Test Student',
            studentId: 'TEST001',
            email: 'test@example.com',
            courseIds: [testCourse._id]
        });
        
        await testStudent.save();
        console.log('✅ Sample student created successfully');
        
        // Clean up test data
        await Course.findByIdAndDelete(testCourse._id);
        await Student.findByIdAndDelete(testStudent._id);
        console.log('✅ Test data cleaned up');
        
        console.log('\n🎉 Database setup completed successfully!');
        console.log('\n🚀 You can now start the application with:');
        console.log('   npm run dev');
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.log('\n🔧 Troubleshooting tips:');
        console.log('   1. Make sure MongoDB is running');
        console.log('   2. Check your MONGODB_URI in config.env');
        console.log('   3. Ensure MongoDB port 27017 is accessible');
        console.log('   4. Check if you have proper permissions');
        
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

// Run setup if this file is executed directly
if (require.main === module) {
    setupDatabase();
}

module.exports = setupDatabase;
