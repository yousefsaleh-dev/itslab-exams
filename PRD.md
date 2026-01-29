# Product Requirements Document (PRD)
## ITS Lab Exam System

**Version:** 1.0  
**Date:** January 2026  
**Status:** Production

---

## 1. Executive Summary

The ITS Lab Exam System is a secure, web-based examination platform that enables administrators to create and manage online exams while ensuring academic integrity through comprehensive proctoring features.

### Key Objectives
- Provide a secure online examination environment
- Prevent cheating through fullscreen enforcement and activity monitoring
- Handle network interruptions gracefully
- Deliver accurate, server-calculated results
- Give administrators full control and visibility

---

## 2. Target Users

### Primary Users

| User Type | Description | Key Needs |
|-----------|-------------|-----------|
| **Administrator** | Instructors/Teachers | Create exams, monitor attempts, view analytics, manage access |
| **Student** | Exam takers | Take exams securely, view results, recover from interruptions |

---

## 3. Core Features

### 3.1 Exam Management (Admin)

#### 3.1.1 Exam Creation
- **Title & Description**: Set exam name and instructions
- **Duration**: Configure time limit in minutes
- **Passing Score**: Set minimum percentage to pass
- **Access Control**: Optional access code requirement
- **Activation**: Toggle exam active/inactive status
- **Shuffle Options**: 
  - Randomize question order per student
  - Randomize answer option order per question
- **Offline Grace Period**: Configure time allowance for network issues (default: 10 minutes)
- **Exit Warning**: Set countdown before auto-submit on fullscreen exit (default: 10 seconds)
- **Max Exits**: Configure maximum allowed fullscreen exits before auto-submit

#### 3.1.2 Question Management
- **Question Builder**: Add multiple-choice questions
- **Flexible Options**: Support any number of answer options per question
- **Point Values**: Assign different points per question
- **Correct Answer**: Mark the correct option for each question
- **Question Order**: Automatic ordering with shuffle capability

#### 3.1.3 Exam Operations
- **Clone Exams**: Duplicate existing exams with all questions
- **Edit Exams**: Modify exam details and questions
- **Delete Exams**: Remove exams (with confirmation)
- **Share Links**: Generate and copy unique exam URLs
- **Export Results**: Download attempt data to Excel

### 3.2 Exam Taking (Student)

#### 3.2.1 Pre-Exam
- **Access**: Open exam via unique link
- **Student Name**: Enter full name to identify attempt
- **Access Code**: Enter code if required by exam
- **Rules Review**: View exam instructions and rules
- **Fullscreen Requirement**: Must enter fullscreen to start

#### 3.2.2 During Exam
- **Question Navigation**: Move between questions freely
- **Answer Selection**: Select one option per question
- **Flag for Review**: Mark questions for later review
- **Timer Display**: Visible countdown timer throughout
- **Progress Indicator**: Show current question number
- **Auto-Save**: Answers saved automatically
- **Submit**: Manual submission when complete

#### 3.2.3 Post-Exam
- **Immediate Results**: View score and pass/fail status (if enabled)
- **Score Display**: See percentage and points earned
- **Recovery**: Resume interrupted exams if needed

### 3.3 Security & Proctoring

#### 3.3.1 Fullscreen Enforcement
- **Mandatory Fullscreen**: Cannot take exam outside fullscreen
- **Exit Detection**: Track when student exits fullscreen
- **Warning System**: Countdown timer before auto-submit
- **Auto-Submit**: Automatically submit after max exits reached
- **Window Switch Tracking**: Monitor tab/window switches

#### 3.3.2 Activity Monitoring
- **Exit Count**: Track number of fullscreen exits
- **Window Switches**: Count tab/window changes
- **Copy Attempts**: Detect and log copy/paste attempts
- **Right-Click Blocking**: Prevent context menu access
- **DevTools Prevention**: Block developer tools shortcuts
- **Suspicious Activity Log**: Record all violations

#### 3.3.3 Data Protection
- **Server-Side Scoring**: All calculations on server
- **Answer Encryption**: Correct answers never sent to browser
- **State Encryption**: Local exam state encrypted
- **Tampering Prevention**: Client cannot modify scores
- **Row Level Security**: Database-level access control

### 3.4 Time Management

#### 3.4.1 Timer Features
- **Countdown Timer**: Visible throughout exam
- **Time Warnings**: Alerts at 5 minutes, 1 minute, and 30 seconds
- **Auto-Submit on Expiry**: Automatically submit when time runs out
- **Server Validation**: Server verifies time limits on submission

#### 3.4.2 Offline Handling
- **Connection Detection**: Monitor network status
- **Grace Period**: Timer pauses during offline (configurable)
- **Offline Modal**: Show connection status to student
- **Auto-Resume**: Automatically resume when connection returns
- **Answer Preservation**: All answers saved during offline
- **Grace Limit**: Auto-submit if offline too long

### 3.5 Results & Analytics (Admin)

#### 3.5.1 Dashboard
- **Total Exams**: Count of all created exams
- **Active Exams**: Currently available exams
- **Inactive Exams**: Deactivated exams
- **Search**: Filter exams by title
- **Quick Actions**: Access, clone, delete exams

#### 3.5.2 Exam Analytics
- **Total Attempts**: Number of students who attempted
- **Completed Count**: Successfully finished attempts
- **In-Progress**: Currently active attempts
- **Pass Rate**: Percentage of passing attempts
- **Average Score**: Mean score across all attempts
- **Per-Question Stats**: See which questions were hardest

#### 3.5.3 Attempt Details
- **Student List**: View all attempts for an exam
- **Individual Scores**: See each student's score
- **Time Spent**: How long each student took
- **Violations**: View exit counts and suspicious activities
- **Answer Review**: See student's answers vs correct answers
- **Export**: Download all results to Excel

### 3.6 Authentication & Access

#### 3.6.1 Admin Authentication
- **Login**: Email and password authentication
- **Password Security**: Bcrypt hashing
- **Forgot Password**: Email-based password reset
- **Session Management**: Secure session handling
- **Logout**: Secure session termination

#### 3.6.2 Access Control
- **Admin Isolation**: Admins can only access their own exams
- **RLS Policies**: Database-level security
- **API Authentication**: Secure API endpoints
- **Student Access**: No authentication required (name-based)

---

## 4. Technical Architecture

### 4.1 Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript |
| **Styling** | Tailwind CSS |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Custom (Bcrypt) |
| **State Management** | Zustand |
| **Email** | Resend |
| **Deployment** | Vercel |
| **Storage** | Encrypted localStorage |

### 4.2 Database Schema

#### Core Tables
- **admins**: Administrator accounts
- **exams**: Exam definitions
- **questions**: Exam questions
- **options**: Answer options for questions
- **student_attempts**: Student exam attempts
- **student_answers**: Student's selected answers
- **password_reset_tokens**: Password reset tokens
- **attempt_recovery_log**: Recovery audit log

#### Key Relationships
- Admin → Exams (one-to-many)
- Exam → Questions (one-to-many)
- Question → Options (one-to-many)
- Exam → Attempts (one-to-many)
- Attempt → Answers (one-to-many)

### 4.3 Security Measures

1. **Authentication**: Bcrypt password hashing
2. **Authorization**: Row Level Security (RLS) policies
3. **Data Isolation**: Admins isolated by admin_id
4. **Answer Protection**: Correct answers server-only
5. **Server Scoring**: All calculations on backend
6. **State Encryption**: LocalStorage encryption
7. **Input Validation**: Server-side validation
8. **Time Validation**: Server verifies time limits

---

## 5. User Flows

### 5.1 Admin Flow: Create Exam

1. Admin logs into dashboard
2. Clicks "Create New Exam"
3. Fills exam details (title, description, duration, pass score)
4. Configures security settings (max exits, grace period, access code)
5. Adds questions with options
6. Marks correct answer for each question
7. Saves exam
8. Activates exam
9. Copies exam link to share with students

### 5.2 Student Flow: Take Exam

1. Student opens exam link
2. Enters full name
3. Enters access code (if required)
4. Reviews exam rules
5. Clicks "Start Exam" → enters fullscreen
6. Answers questions (can flag for review)
7. Navigates between questions
8. Submits when complete or time expires
9. Views result (if enabled by admin)

### 5.3 Offline Recovery Flow

1. Student loses internet during exam
2. System detects disconnection
3. Shows "Connection Lost" modal
4. Exam timer pauses
5. Grace period countdown begins
6. When connection returns:
   - System auto-resumes
   - Answers preserved
   - Timer continues from pause point
7. If grace period exhausted → auto-submit

### 5.4 Fullscreen Exit Flow

1. Student exits fullscreen (Alt+Tab, Escape, etc.)
2. Warning modal appears with countdown
3. Exit count increments
4. Student clicks "Return to Fullscreen"
5. Exam continues
6. If max exits reached → auto-submit

---

## 6. Non-Functional Requirements

### 6.1 Performance
- Page load time: < 2 seconds
- API response time: < 500ms
- Real-time timer updates: Smooth 1-second intervals
- Offline detection: < 1 second latency

### 6.2 Reliability
- Uptime: 99.9% availability
- Data persistence: 100% answer preservation
- Recovery: Automatic from localStorage loss
- Error handling: Graceful degradation

### 6.3 Security
- Password hashing: Bcrypt (10 rounds)
- HTTPS: Required for all connections
- XSS protection: Input sanitization
- CSRF protection: Token validation
- SQL injection: Parameterized queries

### 6.4 Usability
- Responsive design: Mobile, tablet, desktop
- Accessibility: Keyboard navigation support
- Error messages: Clear and actionable
- Loading states: Visual feedback
- Toast notifications: User-friendly alerts

### 6.5 Compatibility
- Browsers: Chrome, Firefox, Safari, Edge (latest 2 versions)
- Devices: Desktop, laptop, tablet
- Screen sizes: 1024px minimum width recommended

---

## 7. Future Enhancements

### Phase 2 Features
1. **Bulk Question Import**: Upload from Excel/CSV
2. **Scheduled Exams**: Auto-activate at specific times
3. **Multiple Question Types**: Fill-in-blank, matching, essay
4. **Question Pools**: Random selection from larger bank
5. **Student Certificates**: Auto-generated PDF on pass
6. **Detailed Answer Review**: Show correct/incorrect after submit
7. **Real-time Monitoring**: Live view of active students
8. **Student Accounts**: Optional student registration
9. **Exam Categories**: Organize exams by subject/course
10. **Advanced Analytics**: Charts, trends, question difficulty analysis

---

## 8. Success Metrics

### Key Performance Indicators (KPIs)
- **Exam Creation Rate**: Number of exams created per admin
- **Attempt Completion Rate**: % of started exams that are completed
- **Average Score**: Mean score across all attempts
- **Security Violations**: Number of suspicious activities detected
- **Recovery Success Rate**: % of interrupted exams successfully recovered
- **User Satisfaction**: Admin and student feedback scores

---

## 9. Constraints & Limitations

### Current Limitations
- Single question type: Multiple-choice only
- No student accounts: Name-based identification only
- No scheduling: Manual activation required
- No question bank: Questions tied to specific exams
- No real-time monitoring: Post-exam analysis only
- No mobile optimization: Desktop-focused design

### Technical Constraints
- Requires modern browser with JavaScript enabled
- Requires stable internet connection (with grace period)
- Fullscreen API limitations in some browsers
- localStorage size limits for large exams

---

## 10. Glossary

- **Attempt**: A student's single session taking an exam
- **Grace Period**: Allowed offline time before auto-submit
- **Max Exits**: Maximum fullscreen exits before auto-submit
- **RLS**: Row Level Security (database access control)
- **Shuffle**: Randomize order of questions or options
- **Access Code**: Optional password to start exam
- **Auto-Submit**: Automatic exam submission by system
- **Recovery**: Restoring exam state from localStorage

---

**Document Owner**: Development Team  
**Last Updated**: January 2026  
**Next Review**: Quarterly
