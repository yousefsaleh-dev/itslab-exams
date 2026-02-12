-- ========================================
-- ANTI-CHEAT ENHANCEMENT MIGRATION
-- تحسينات مكافحة الغش
-- ========================================
-- Run this in Supabase SQL Editor
-- ⚠️ IMPORTANT: Review before running in production

-- ========================================
-- STEP 1: Add IP and User-Agent tracking columns
-- ========================================

ALTER TABLE student_attempts 
ADD COLUMN IF NOT EXISTS ip_address TEXT,
ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Add comments for documentation
COMMENT ON COLUMN student_attempts.ip_address IS 'Client IP address when exam was started. Used for anti-cheat tracking.';
COMMENT ON COLUMN student_attempts.user_agent IS 'Browser User-Agent string when exam was started. Used for device identification.';

-- ========================================
-- STEP 2: Create index for IP-based queries
-- ========================================

CREATE INDEX IF NOT EXISTS idx_attempts_by_ip 
ON student_attempts (ip_address, exam_id) 
WHERE ip_address IS NOT NULL;

-- ========================================
-- STEP 3: Update RLS policies (if needed)
-- ========================================
-- The ip_address and user_agent columns should be:
-- - Writable by anon (student sets on exam start)
-- - Readable by admin (for reviewing attempts)

-- No new RLS policies needed since existing policies on student_attempts
-- already allow insert for students and select for admins based on admin_id.

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- 1. Check new columns exist
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'student_attempts' 
-- AND column_name IN ('ip_address', 'user_agent');

-- 2. Check index
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'student_attempts' 
-- AND indexname = 'idx_attempts_by_ip';
