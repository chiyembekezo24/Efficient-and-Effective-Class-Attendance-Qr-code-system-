// Student QR Code Scanner JavaScript

let stream = null;
let scanning = false;
let qrData = null;

// DOM Elements
const video = document.getElementById('video');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const startCameraBtn = document.getElementById('startCamera');
const stopCameraBtn = document.getElementById('stopCamera');
const qrDataInput = document.getElementById('qrDataInput');
const processQRDataBtn = document.getElementById('processQRData');
const courseInfo = document.getElementById('courseInfo');
const studentForm = document.getElementById('studentForm');
const attendanceForm = document.getElementById('attendanceForm');
const statusMessage = document.getElementById('statusMessage');

// Camera Functions
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        video.srcObject = stream;
        video.style.display = 'block';
        cameraPlaceholder.style.display = 'none';
        startCameraBtn.style.display = 'none';
        stopCameraBtn.style.display = 'block';
        
        // Start scanning
        scanning = true;
        scanQRCode();
        
        showMessage('Camera started successfully. Point it at a QR code.', 'info');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showMessage('Could not access camera. Please check permissions.', 'error');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    video.style.display = 'none';
    cameraPlaceholder.style.display = 'flex';
    startCameraBtn.style.display = 'block';
    stopCameraBtn.style.display = 'none';
    scanning = false;
    
    showMessage('Camera stopped.', 'info');
}

// QR Code Scanning
function scanQRCode() {
    if (!scanning) return;
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        
        if (code) {
            console.log('QR Code detected:', code.data);
            processQRCode(code.data);
            return;
        }
    }
    
    // Continue scanning
    requestAnimationFrame(scanQRCode);
}

// Process QR Code Data
function processQRCode(data) {
    try {
        const parsedData = JSON.parse(data);
        
        if (parsedData.courseId && parsedData.timestamp && parsedData.sessionId) {
            qrData = parsedData;
            stopCamera();
            showCourseInfo(parsedData);
            showStudentForm();
        } else {
            showMessage('Invalid QR code format.', 'error');
        }
    } catch (error) {
        console.error('Error parsing QR code:', error);
        showMessage('Invalid QR code data.', 'error');
    }
}

// Manual QR Data Processing
function processManualQRData() {
    const data = qrDataInput.value.trim();
    
    if (!data) {
        showMessage('Please enter QR code data.', 'error');
        return;
    }
    
    try {
        // Check if it's a URL first
        if (data.startsWith('http')) {
            const url = new URL(data);
            const qrDataParam = url.searchParams.get('data');
            if (qrDataParam) {
                const parsedData = JSON.parse(decodeURIComponent(qrDataParam));
                if (parsedData.courseId && parsedData.timestamp && parsedData.sessionId) {
                    qrData = parsedData;
                    showCourseInfo(parsedData);
                    showStudentForm();
                    return;
                }
            }
        }
        
        // Try parsing as JSON directly
        const parsedData = JSON.parse(data);
        
        if (parsedData.courseId && parsedData.timestamp && parsedData.sessionId) {
            qrData = parsedData;
            showCourseInfo(parsedData);
            showStudentForm();
        } else {
            showMessage('Invalid QR code format.', 'error');
        }
    } catch (error) {
        console.error('Error parsing QR code:', error);
        showMessage('Invalid QR code data format.', 'error');
    }
}

// Show Course Information
async function showCourseInfo(qrData) {
    try {
        const response = await fetch(`/api/courses/${qrData.courseId}`);
        
        if (response.ok) {
            const course = await response.json();
            
            document.getElementById('courseName').textContent = course.name;
            document.getElementById('instructorName').textContent = course.instructor;
            document.getElementById('sessionTime').textContent = new Date(qrData.timestamp).toLocaleString();
            
            courseInfo.style.display = 'block';
        } else {
            showMessage('Course not found.', 'error');
        }
    } catch (error) {
        console.error('Error fetching course info:', error);
        showMessage('Error loading course information.', 'error');
    }
}

// Show Student Form
function showStudentForm() {
    studentForm.style.display = 'block';
    studentForm.scrollIntoView({ behavior: 'smooth' });
}

// Submit Attendance
async function submitAttendance(formData) {
    try {
        // First, check if student exists or create new student
        let studentId = await findOrCreateStudent(formData);
        
        if (!studentId) {
            showMessage('Error creating student record.', 'error');
            return;
        }
        
        // Mark attendance
        const attendanceData = {
            qrData: JSON.stringify(qrData),
            studentId: studentId
        };
        
        const response = await fetch('/api/attendance/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(attendanceData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showMessage('Attendance marked successfully!', 'success');
            resetForm();
        } else {
            showMessage(result.error || 'Error marking attendance.', 'error');
        }
    } catch (error) {
        console.error('Error submitting attendance:', error);
        showMessage('Error marking attendance. Please try again.', 'error');
    }
}

// Find or Create Student
async function findOrCreateStudent(formData) {
    try {
        // First, try to find existing student by student ID
        const findResponse = await fetch(`/api/students/search?studentId=${formData.studentId}`);
        
        if (findResponse.ok) {
            const existingStudent = await findResponse.json();
            if (existingStudent) {
                // If student exists, check if they're already enrolled in this course
                if (!existingStudent.courseIds.includes(qrData.courseId)) {
                    // Add course to student's enrolled courses
                    const updateResponse = await fetch(`/api/students/${existingStudent._id}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            courseIds: [...existingStudent.courseIds, qrData.courseId]
                        })
                    });
                    
                    if (!updateResponse.ok) {
                        showMessage('Error updating student enrollment.', 'error');
                        return null;
                    }
                }
                return existingStudent._id;
            }
        }
        
        // Create new student if they don't exist
        const createResponse = await fetch('/api/students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: formData.name,
                studentId: formData.studentId,
                email: '', // Empty email since it's not required
                courseIds: [qrData.courseId]
            })
        });
        
        if (createResponse.ok) {
            const newStudent = await createResponse.json();
            showMessage('Student account created successfully!', 'success');
            return newStudent._id;
        } else {
            const error = await createResponse.json();
            showMessage(error.error || 'Error creating student account.', 'error');
            return null;
        }
    } catch (error) {
        console.error('Error finding/creating student:', error);
        showMessage('Error processing student information.', 'error');
        return null;
    }
}

// Utility Functions
function showMessage(message, type = 'info') {
    statusMessage.className = `status-message ${type}`;
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

function resetForm() {
    attendanceForm.reset();
    courseInfo.style.display = 'none';
    studentForm.style.display = 'none';
    qrDataInput.value = '';
    qrData = null;
}

// Event Listeners
startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);
processQRDataBtn.addEventListener('click', processManualQRData);

attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Disable submit button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    
    await submitAttendance(data);
    
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-check"></i> Mark Attendance';
});

// Check camera permissions on page load
document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMessage('Camera access is not supported in this browser.', 'error');
        startCameraBtn.disabled = true;
    }
    
    // Check if QR data is passed in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const qrDataParam = urlParams.get('data');
    
    if (qrDataParam) {
        try {
            const parsedData = JSON.parse(decodeURIComponent(qrDataParam));
            if (parsedData.courseId && parsedData.timestamp && parsedData.sessionId) {
                qrData = parsedData;
                showCourseInfo(parsedData);
                showStudentForm();
                
                // Show the QR data loaded message
                const qrDataLoadedMessage = document.getElementById('qrDataLoadedMessage');
                if (qrDataLoadedMessage) {
                    qrDataLoadedMessage.style.display = 'block';
                }
                
                showMessage('QR code data loaded successfully!', 'success');
            }
        } catch (error) {
            console.error('Error parsing QR data from URL:', error);
            showMessage('Invalid QR code data in URL.', 'error');
        }
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});
