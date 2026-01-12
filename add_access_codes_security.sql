-- ========================================
-- Add Access Codes & Security Tracking
-- ========================================

-- Add access code support to exams
ALTER TABLE exams
ADD COLUMN IF NOT EXISTS requires_access_code BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS access_code TEXT;

-- Add security tracking to student_attempts
ALTER TABLE student_attempts
ADD COLUMN IF NOT EXISTS devtools_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS copy_attempts INTEGER DEFAULT 0;

-- Comments
COMMENT ON COLUMN exams.requires_access_code IS 'Whether this exam requires an access code to start';
COMMENT ON COLUMN exams.access_code IS 'The access code required to start this exam (if required)';
COMMENT ON COLUMN student_attempts.devtools_detected IS 'Whether DevTools were detected during exam';
COMMENT ON COLUMN student_attempts.copy_attempts IS 'Number of times student tried to copy during exam';
