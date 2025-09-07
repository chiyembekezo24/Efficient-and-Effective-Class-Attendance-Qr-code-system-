// Student QR Code Scanner JavaScript

let qrData = null;

// DOM Elements
const courseInfo = document.getElementById('courseInfo');
const studentForm = document.getElementById('studentForm');
const attendanceForm = document.getElementById('attendanceForm');
const statusMessage = document.getElementById('statusMessage');

// Process QR Code Data from URL
function processQRCodeFromURL(data) {
    try {
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
        showMessage('Invalid QR code data.', 'error');
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

// Location Functions
async function getCurrentLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.log('Geolocation is not supported by this browser.');
            resolve(null);
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        };

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };

                    // Try to get address from coordinates
                    const address = await getAddressFromCoordinates(location.latitude, location.longitude);
                    location.address = address;

                    console.log('Location captured:', location);
                    resolve(location);
                } catch (error) {
                    console.error('Error getting address:', error);
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                }
            },
            (error) => {
                console.error('Error getting location:', error);
                let errorMessage = 'Unable to get location';
                
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location access denied by user';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information unavailable';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out';
                        break;
                }
                
                showMessage(`Location: ${errorMessage}. Attendance will be marked without location data.`, 'info');
                resolve(null);
            },
            options
        );
    });
}

async function getAddressFromCoordinates(lat, lng) {
    try {
        // Using a free reverse geocoding service
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
        const data = await response.json();
        
        if (data.locality && data.principalSubdivision && data.countryName) {
            return `${data.locality}, ${data.principalSubdivision}, ${data.countryName}`;
        } else if (data.principalSubdivision && data.countryName) {
            return `${data.principalSubdivision}, ${data.countryName}`;
        } else {
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    } catch (error) {
        console.error('Error getting address:', error);
        return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
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
        
        // Get current location
        const location = await getCurrentLocation();
        
        // Mark attendance
        const attendanceData = {
            qrData: JSON.stringify(qrData),
            studentId: studentId,
            location: location
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
            showMessage('Attendance has been marked successfully!', 'success');
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
                email: '', // Empty email since we removed the field
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
    qrData = null;
}

// Event Listeners
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

// Check if QR data is passed in URL parameters on page load
document.addEventListener('DOMContentLoaded', () => {
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
                
                showMessage('QR code data loaded successfully!', 'success');
            }
        } catch (error) {
            console.error('Error parsing QR data from URL:', error);
            showMessage('Invalid QR code data in URL.', 'error');
        }
    }
});