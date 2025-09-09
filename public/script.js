// Global variables
let courses = [];
let students = [];
let attendanceRecords = [];
let currentQRTimer = null;

// API Base URL
const API_BASE = '';

// Utility functions
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(messageDiv, mainContent.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// API functions
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'API request failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Navigation
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Update active button
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active tab
            tabContents.forEach(tab => tab.classList.remove('active'));
            document.getElementById(targetTab).classList.add('active');
            
            // Load data for the tab
            loadTabData(targetTab);
        });
    });
}

// Modal functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'block';
    
    // Load data for specific modals
    if (modalId === 'addStudentModal') {
        loadCoursesForStudentModal();
    } else if (modalId === 'generateQRModal') {
        loadCoursesForQRModal();
    } else if (modalId === 'scanQRModal') {
        loadStudentsForScanModal();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
    
    // Reset forms
    const form = modal.querySelector('form');
    if (form) {
        form.reset();
    }
    
    // Hide QR display
    const qrDisplay = modal.querySelector('.qr-display');
    if (qrDisplay) {
        qrDisplay.style.display = 'none';
    }
    
    // Clear timer
    if (currentQRTimer) {
        clearInterval(currentQRTimer);
        currentQRTimer = null;
    }
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            closeModal(modal.id);
        }
    });
});

// Dashboard functions
async function loadDashboard() {
    try {
        const [coursesData, studentsData, reportsData] = await Promise.all([
            apiCall('/api/courses'),
            apiCall('/api/students'),
            apiCall('/api/reports')
        ]);
        
        courses = coursesData;
        students = studentsData;
        
        // Update dashboard stats
        document.getElementById('totalCourses').textContent = courses.length;
        document.getElementById('totalStudents').textContent = students.length;
        
        // Calculate today's attendance
        const today = new Date().toISOString().split('T')[0];
        const todayAttendance = reportsData.reduce((total, report) => total + report.present, 0);
        document.getElementById('todayAttendance').textContent = todayAttendance;
        
        // Calculate average attendance
        const totalEnrolled = reportsData.reduce((total, report) => total + report.totalEnrolled, 0);
        const totalPresent = reportsData.reduce((total, report) => total + report.present, 0);
        const avgAttendance = totalEnrolled > 0 ? ((totalPresent / totalEnrolled) * 100).toFixed(1) : 0;
        document.getElementById('avgAttendance').textContent = `${avgAttendance}%`;
        
        // Load recent activity
        loadRecentActivity();
        
    } catch (error) {
        showMessage('Failed to load dashboard data', 'error');
    }
}

async function loadRecentActivity() {
    try {
        const activity = await apiCall('/api/attendance');
        const activityList = document.getElementById('recentActivity');
        
        if (activity.length === 0) {
            activityList.innerHTML = '<p class="no-data">No recent activity</p>';
            return;
        }
        
        const recentActivity = activity.slice(0, 10); // Show last 10 activities
        const activityHTML = recentActivity.map(record => {
                    const student = students.find(s => s._id === record.studentId);
        const course = courses.find(c => c._id === record.courseId);
            
            return `
                <div class="activity-item">
                    <strong>${student ? student.name : 'Unknown Student'}</strong> 
                    marked attendance for 
                    <strong>${course ? course.name : 'Unknown Course'}</strong>
                    <span class="activity-time">${formatTime(record.timestamp)}</span>
                </div>
            `;
        }).join('');
        
        activityList.innerHTML = activityHTML;
        
    } catch (error) {
        console.error('Failed to load recent activity:', error);
    }
}

// Course functions
async function loadCourses() {
    try {
        courses = await apiCall('/api/courses');
        displayCourses();
    } catch (error) {
        showMessage('Failed to load courses', 'error');
    }
}

function displayCourses() {
    const coursesList = document.getElementById('coursesList');
    
    if (courses.length === 0) {
        coursesList.innerHTML = '<p class="no-data">No courses available</p>';
        return;
    }
    
    const coursesHTML = courses.map(course => `
        <div class="card">
            <div class="card-header">
                <div>
                    <div class="card-title">${course.name}</div>
                    <div class="card-subtitle">Instructor: ${course.instructor}</div>
                </div>
                <div class="card-actions">
                    <button class="btn btn-primary" onclick="generateQRCode('${course._id}')">
                        <i class="fas fa-qrcode"></i> QR Code
                    </button>
                    <button class="btn btn-danger" onclick="deleteCourse('${course._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-content">
                <p><strong>Schedule:</strong> ${course.schedule || 'Not specified'}</p>
                <p><strong>Description:</strong> ${course.description || 'No description'}</p>
            </div>
            <div class="card-footer">
                <span>Created: ${formatDate(course.createdAt)}</span>
                ${course.qrCode ? `<span>QR Generated: ${formatTime(course.qrGeneratedAt)}</span>` : ''}
            </div>
        </div>
    `).join('');
    
    coursesList.innerHTML = coursesHTML;
}

async function addCourse(formData) {
    try {
        const course = await apiCall('/api/courses', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        showMessage('Course added successfully', 'success');
        closeModal('addCourseModal');
        loadCourses();
        loadDashboard();
        
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function deleteCourse(courseId) {
    if (!confirm('Are you sure you want to delete this course?')) {
        return;
    }
    
    try {
        await apiCall(`/api/courses/${courseId}`, {
            method: 'DELETE'
        });
        
        showMessage('Course deleted successfully', 'success');
        loadCourses();
        loadDashboard();
        
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

// Student functions
async function loadStudents() {
    try {
        students = await apiCall('/api/students');
        displayStudents();
    } catch (error) {
        showMessage('Failed to load students', 'error');
    }
}

function displayStudents() {
    const studentsList = document.getElementById('studentsList');
    
    if (students.length === 0) {
        studentsList.innerHTML = '<p class="no-data">No students available</p>';
        return;
    }
    
    const studentsHTML = students.map(student => {
        const enrolledCourses = student.courseIds.map(courseId => {
            const course = courses.find(c => c._id === courseId);
            return course ? course.name : 'Unknown Course';
        }).join(', ');
        
        return `
            <div class="card">
                <div class="card-header">
                    <div>
                        <div class="card-title">${student.name}</div>
                        <div class="card-subtitle">ID: ${student.studentId}</div>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-secondary" onclick="editStudent('${student._id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger" onclick="deleteStudent('${student._id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="card-content">
                    <p><strong>Email:</strong> ${student.email}</p>
                    <p><strong>Enrolled Courses:</strong> ${enrolledCourses || 'None'}</p>
                </div>
                <div class="card-footer">
                    <span>Created: ${formatDate(student.createdAt)}</span>
                </div>
            </div>
        `;
    }).join('');
    
    studentsList.innerHTML = studentsHTML;
}

async function addStudent(formData) {
    try {
        const student = await apiCall('/api/students', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        showMessage('Student added successfully', 'success');
        closeModal('addStudentModal');
        loadStudents();
        loadDashboard();
        
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function deleteStudent(studentId) {
    if (!confirm('Are you sure you want to delete this student?')) {
        return;
    }
    
    try {
        await apiCall(`/api/students/${studentId}`, {
            method: 'DELETE'
        });
        
        showMessage('Student deleted successfully', 'success');
        loadStudents();
        loadDashboard();
        
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

// QR Code functions
async function generateQRCode(courseId) {
    try {
        const result = await apiCall(`/api/courses/${courseId}/qr-code`, {
            method: 'POST'
        });
        
        showQRCode(result.qrCode, result.sessionId);
        showMessage('QR Code generated successfully', 'success');
        
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

function showQRCode(qrCodeDataURL, sessionId) {
    const qrDisplay = document.getElementById('qrCodeDisplay');
    const qrImage = document.getElementById('qrCodeImage');
    
    qrImage.innerHTML = `<img src="${qrCodeDataURL}" alt="QR Code">`;
    qrDisplay.style.display = 'block';
    
    // Start timer
    startQRTimer();
}

function startQRTimer() {
    let timeLeft = 300; // 5 minutes in seconds
    const timerElement = document.getElementById('qrTimer');
    
    currentQRTimer = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (timeLeft <= 0) {
            clearInterval(currentQRTimer);
            timerElement.textContent = 'Expired';
            timerElement.style.color = '#e53e3e';
        }
        
        timeLeft--;
    }, 1000);
}

// Attendance functions
async function markAttendance(formData) {
    try {
        const result = await apiCall('/api/attendance/scan', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        showMessage('Attendance marked successfully', 'success');
        closeModal('scanQRModal');
        loadAttendance();
        loadDashboard();
        
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function loadAttendance() {
    try {
        attendanceRecords = await apiCall('/api/attendance');
        displayAttendance();
    } catch (error) {
        showMessage('Failed to load attendance records', 'error');
    }
}

function displayAttendance() {
    const attendanceList = document.getElementById('attendanceList');
    
    if (attendanceRecords.length === 0) {
        attendanceList.innerHTML = '<p class="no-data">No attendance records available</p>';
        return;
    }
    
    const attendanceHTML = attendanceRecords.map(record => {
        const student = students.find(s => s._id === record.studentId);
        const course = courses.find(c => c._id === record.courseId);
        
        return `
            <div class="attendance-item">
                <div class="attendance-info">
                    <strong>${student ? student.name : 'Unknown Student'}</strong>
                    <span class="attendance-course">${course ? course.name : 'Unknown Course'}</span>
                </div>
                <div class="attendance-time">
                    ${formatDate(record.timestamp)}
                </div>
            </div>
        `;
    }).join('');
    
    attendanceList.innerHTML = attendanceHTML;
}

// Report functions
async function generateReports() {
    const date = document.getElementById('reportDate').value;
    
    try {
        const reports = await apiCall(`/api/reports${date ? `?date=${date}` : ''}`);
        displayReports(reports);
    } catch (error) {
        showMessage('Failed to generate reports', 'error');
    }
}

function displayReports(reports) {
    const reportsContainer = document.getElementById('reportsContainer');
    
    if (reports.length === 0) {
        reportsContainer.innerHTML = '<p class="no-data">No reports available for the selected date</p>';
        return;
    }
    
    const reportsHTML = reports.map(report => `
        <div class="report-card">
            <div class="report-header">
                <h3>${report.courseName}</h3>
                <button class="btn btn-secondary" onclick="downloadReport('${report.courseId}')" style="padding: 8px 16px; font-size: 0.9rem;">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
            <p><strong>Instructor:</strong> ${report.instructor}</p>
            <div class="report-stats">
                <div class="stat-item">
                    <div class="stat-number">${report.totalEnrolled}</div>
                    <div class="stat-label">Enrolled</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${report.present}</div>
                    <div class="stat-label">Present</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${report.absent}</div>
                    <div class="stat-label">Absent</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${report.attendanceRate}%</div>
                    <div class="stat-label">Rate</div>
                </div>
            </div>
            <div class="report-actions">
                <button class="btn btn-primary" onclick="showReportDetail('${report.courseId}')" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-eye"></i> View Details
                </button>
            </div>
        </div>
    `).join('');
    
    reportsContainer.innerHTML = reportsHTML;
}

async function showReportDetail(courseId) {
    const date = document.getElementById('reportDate').value;
    
    try {
        const report = await apiCall(`/api/reports/attendance/${courseId}${date ? `?date=${date}` : ''}`);
        displayReportDetail(report);
        showModal('reportDetailModal');
    } catch (error) {
        showMessage('Failed to load report details', 'error');
    }
}

function displayReportDetail(report) {
    const reportDetailContent = document.getElementById('reportDetailContent');
    
    const detailHTML = `
        <div class="report-summary">
            <h2>${report.course.name}</h2>
            <p><strong>Instructor:</strong> ${report.course.instructor}</p>
            <p><strong>Date:</strong> ${report.date}</p>
            
            <div class="report-stats">
                <div class="stat-item">
                    <div class="stat-number">${report.totalEnrolled}</div>
                    <div class="stat-label">Total Enrolled</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${report.present}</div>
                    <div class="stat-label">Present</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${report.absent}</div>
                    <div class="stat-label">Absent</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${report.attendanceRate}%</div>
                    <div class="stat-label">Attendance Rate</div>
                </div>
            </div>
        </div>
        
        <div class="student-list">
            <h4>Present Students (${report.presentStudents.length})</h4>
            ${report.presentStudents.map(student => `
                <div class="student-item">
                    <div class="student-info">
                        <div class="student-name">${student.name}</div>
                        <div class="student-id">${student.studentId}</div>
                    </div>
                    <div class="student-time">${formatTime(student.timestamp)}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="student-list">
            <h4>Absent Students (${report.absentStudents.length})</h4>
            ${report.absentStudents.map(student => `
                <div class="student-item">
                    <div class="student-info">
                        <div class="student-name">${student.name}</div>
                        <div class="student-id">${student.studentId}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    reportDetailContent.innerHTML = detailHTML;
}

// Modal data loading functions
function loadCoursesForStudentModal() {
    const courseSelect = document.getElementById('enrolledCourses');
    courseSelect.innerHTML = '<option value="">Select courses...</option>';
    
    courses.forEach(course => {
        const option = document.createElement('option');
        option.value = course._id;
        option.textContent = course.name;
        courseSelect.appendChild(option);
    });
}

function loadCoursesForQRModal() {
    const courseSelect = document.getElementById('qrCourseSelect');
    courseSelect.innerHTML = '<option value="">Choose a course...</option>';
    
    courses.forEach(course => {
        const option = document.createElement('option');
        option.value = course._id;
        option.textContent = course.name;
        courseSelect.appendChild(option);
    });
}

function loadStudentsForScanModal() {
    const studentSelect = document.getElementById('scanStudentSelect');
    studentSelect.innerHTML = '<option value="">Choose a student...</option>';
    
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student._id;
        option.textContent = `${student.name} (${student.studentId})`;
        studentSelect.appendChild(option);
    });
}

// Tab data loading
function loadTabData(tabName) {
    switch (tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'courses':
            loadCourses();
            break;
        case 'students':
            loadStudents();
            break;
        case 'attendance':
            loadAttendance();
            break;
        case 'reports':
            // Reports are loaded when generate button is clicked
            break;
    }
}

// Form event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize navigation
    initNavigation();
    
    // Load initial dashboard
    loadDashboard();
    
    // Form submissions
    document.getElementById('addCourseForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        addCourse(data);
    });
    
    document.getElementById('addStudentForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        
        // Handle multiple course selections
        const courseIds = Array.from(formData.getAll('courseIds'));
        data.courseIds = courseIds;
        
        addStudent(data);
    });
    
    document.getElementById('generateQRForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const courseId = formData.get('courseId');
        generateQRCode(courseId);
    });
    
    document.getElementById('scanQRForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            studentId: formData.get('studentId'),
            qrData: formData.get('qrData')
        };
        markAttendance(data);
    });
    
    // Set default date for reports
    document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
    
    // Set default date for attendance percentages
    document.getElementById('percentageDate').value = new Date().toISOString().split('T')[0];
});

// Download functions
async function downloadReport(courseId) {
    const date = document.getElementById('reportDate').value;
    const url = `/api/reports/download/${courseId}${date ? `?date=${date}` : ''}`;
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = response.headers.get('content-disposition').split('filename=')[1].replace(/"/g, '');
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
            showMessage('Report downloaded successfully', 'success');
        } else {
            showMessage('Failed to download report', 'error');
        }
    } catch (error) {
        console.error('Error downloading report:', error);
        showMessage('Error downloading report', 'error');
    }
}

async function downloadAllReports() {
    const date = document.getElementById('reportDate').value;
    const url = `/api/reports/download-all${date ? `?date=${date}` : ''}`;
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = response.headers.get('content-disposition').split('filename=')[1].replace(/"/g, '');
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
            showMessage('All reports downloaded successfully', 'success');
        } else {
            showMessage('Failed to download reports', 'error');
        }
    } catch (error) {
        console.error('Error downloading reports:', error);
        showMessage('Error downloading reports', 'error');
    }
}

// Attendance Percentages functions
async function loadAttendancePercentages() {
    const date = document.getElementById('percentageDate').value;
    const studentsList = document.getElementById('studentsList');
    const percentagesContainer = document.getElementById('attendancePercentagesContainer');
    const percentagesList = document.getElementById('attendancePercentagesList');
    
    try {
        // Show percentages container and hide students list
        studentsList.style.display = 'none';
        percentagesContainer.style.display = 'block';
        percentagesList.innerHTML = '<p class="no-data">Loading attendance percentages...</p>';
        
        const percentages = await apiCall(`/api/students/attendance-percentages${date ? `?date=${date}` : ''}`);
        displayAttendancePercentages(percentages);
    } catch (error) {
        showMessage('Failed to load attendance percentages', 'error');
        percentagesList.innerHTML = '<p class="no-data">Failed to load attendance percentages</p>';
    }
}

function displayAttendancePercentages(percentages) {
    const percentagesList = document.getElementById('attendancePercentagesList');
    
    if (percentages.length === 0) {
        percentagesList.innerHTML = '<p class="no-data">No students found or no attendance data available</p>';
        return;
    }
    
    const percentagesHTML = percentages.map(student => {
        const percentageClass = getPercentageClass(student.attendancePercentage);
        
        return `
            <div class="percentage-card">
                <div class="percentage-header">
                    <div class="student-info">
                        <h4>${student.name}</h4>
                        <p>ID: ${student.studentIdNumber} | Email: ${student.email}</p>
                    </div>
                    <div class="enrolled-courses">
                        <span class="badge">${student.enrolledCourses} course${student.enrolledCourses !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                
                <div class="attendance-stats">
                    <div class="stat-item">
                        <span class="stat-value">${student.totalSessions}</span>
                        <span class="stat-label">Total Sessions</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${student.attendedSessions}</span>
                        <span class="stat-label">Attended</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">${student.totalSessions - student.attendedSessions}</span>
                        <span class="stat-label">Missed</span>
                    </div>
                </div>
                
                <div class="percentage-bar">
                    <div class="percentage-fill ${percentageClass}" style="width: ${student.attendancePercentage}%"></div>
                </div>
                
                <div class="percentage-text ${percentageClass}">
                    ${student.attendancePercentage}% Attendance Rate
                </div>
            </div>
        `;
    }).join('');
    
    percentagesList.innerHTML = percentagesHTML;
}

function getPercentageClass(percentage) {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 80) return 'good';
    if (percentage >= 70) return 'average';
    return 'poor';
}

function showStudentsList() {
    const studentsList = document.getElementById('studentsList');
    const percentagesContainer = document.getElementById('attendancePercentagesContainer');
    
    studentsList.style.display = 'grid';
    percentagesContainer.style.display = 'none';
}

// Global functions for onclick handlers
window.showModal = showModal;
window.closeModal = closeModal;
window.generateReports = generateReports;
window.generateQRCode = generateQRCode;
window.deleteCourse = deleteCourse;
window.deleteStudent = deleteStudent;
window.downloadReport = downloadReport;
window.downloadAllReports = downloadAllReports;
window.loadAttendancePercentages = loadAttendancePercentages;
window.showStudentsList = showStudentsList;
