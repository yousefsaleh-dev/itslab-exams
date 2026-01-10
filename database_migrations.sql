-- ========================================
-- DATABASE MIGRATIONS FOR EXAM RECOVERY SYSTEM
-- تحسينات قاعدة البيانات لنظام استعادة الامتحانات
-- ========================================
-- Run this in Supabase SQL Editor
-- ⚠️ IMPORTANT: Review before running in production

-- ========================================
-- STEP 1: Add new columns to student_attempts
-- ========================================

-- Add columns for auto-submit tracking
ALTER TABLE student_attempts 
ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_submit_reason TEXT,
ADD COLUMN IF NOT EXISTS recovery_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_recovery_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN student_attempts.auto_submitted IS 'Whether this attempt was auto-submitted by the system';
COMMENT ON COLUMN student_attempts.auto_submit_reason IS 'Reason for auto-submit: time_expired | inactivity | system_error';
COMMENT ON COLUMN student_attempts.recovery_count IS 'Number of times this attempt was recovered from localStorage loss';
COMMENT ON COLUMN student_attempts.last_recovery_at IS 'Last time this attempt was recovered';

-- ========================================
-- STEP 2: Create recovery audit log table
-- ========================================

CREATE TABLE IF NOT EXISTS attempt_recovery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
  recovery_method TEXT NOT NULL, -- 'api_recovery' | 'auto_recovery' | 'manual'
  previous_state JSONB,
  new_state JSONB,
  recovered_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_recovery_log_attempt_id ON attempt_recovery_log(attempt_id);
CREATE INDEX IF NOT EXISTS idx_recovery_log_recovered_at ON attempt_recovery_log(recovered_at DESC);

COMMENT ON TABLE attempt_recovery_log IS 'Audit log for all attempt recovery operations';

-- ========================================
-- STEP 3: Add constraints for data integrity
-- ========================================

-- Prevent negative time_remaining (with grace period for clock skew)
ALTER TABLE student_attempts 
DROP CONSTRAINT IF EXISTS check_time_remaining_valid;

ALTER TABLE student_attempts
ADD CONSTRAINT check_time_remaining_valid 
CHECK (time_remaining_seconds >= -60);

-- Ensure auto_submit_reason is set when auto_submitted is true
ALTER TABLE student_attempts
DROP CONSTRAINT IF EXISTS check_auto_submit_reason;

ALTER TABLE student_attempts
ADD CONSTRAINT check_auto_submit_reason
CHECK (
  (auto_submitted = false) OR 
  (auto_submitted = true AND auto_submit_reason IS NOT NULL)
);

-- Prevent duplicate incomplete attempts for same student/exam
-- This is a PARTIAL unique index (only for incomplete attempts)
DROP INDEX IF EXISTS idx_unique_incomplete_attempt;

CREATE UNIQUE INDEX idx_unique_incomplete_attempt 
ON student_attempts (exam_id, student_name) 
WHERE completed = false;

COMMENT ON INDEX idx_unique_incomplete_attempt IS 'Ensures one student can only have one incomplete attempt per exam';

-- ========================================
-- STEP 4: Add indexes for performance
-- ========================================

-- Index for finding expired attempts (used by Edge Function)
CREATE INDEX IF NOT EXISTS idx_incomplete_attempts_with_time 
ON student_attempts (completed, time_remaining_seconds, last_activity) 
WHERE completed = false;

-- Index for recovery API (search by student name)
CREATE INDEX IF NOT EXISTS idx_attempts_by_student_name 
ON student_attempts (exam_id, student_name, completed);

-- Index for monitoring auto-submitted attempts
CREATE INDEX IF NOT EXISTS idx_auto_submitted_attempts 
ON student_attempts (auto_submitted, auto_submit_reason) 
WHERE auto_submitted = true;

-- ========================================
-- STEP 5: Create RPC function for logging recovery
-- ========================================

CREATE OR REPLACE FUNCTION log_attempt_recovery(
  p_attempt_id UUID,
  p_method TEXT,
  p_previous_state JSONB DEFAULT NULL,
  p_new_state JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Insert recovery log entry
  INSERT INTO attempt_recovery_log (
    attempt_id,
    recovery_method,
    previous_state,
    new_state,
    recovered_at
  ) VALUES (
    p_attempt_id,
    p_method,
    p_previous_state,
    p_new_state,
    NOW()
  ) RETURNING id INTO v_log_id;

  -- Increment recovery count
  UPDATE student_attempts 
  SET 
    recovery_count = COALESCE(recovery_count, 0) + 1,
    last_recovery_at = NOW()
  WHERE id = p_attempt_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_attempt_recovery IS 'Logs attempt recovery and updates recovery count';

-- ========================================
-- STEP 6: Create view for suspicious attempts monitoring
-- ========================================

CREATE OR REPLACE VIEW suspicious_attempts_view AS
SELECT 
  sa.id,
  sa.exam_id,
  sa.student_name,
  sa.exit_count,
  sa.window_switches,
  sa.recovery_count,
  sa.auto_submitted,
  sa.auto_submit_reason,
  sa.started_at,
  sa.completed_at,
  sa.last_activity,
  e.title as exam_title,
  e.max_exits,
  -- Flags for suspicious activity
  (sa.exit_count >= e.max_exits) as exceeded_max_exits,
  (sa.window_switches > 10) as excessive_window_switches,
  (sa.recovery_count > 3) as excessive_recoveries,
  (sa.auto_submitted = true) as was_auto_submitted
FROM student_attempts sa
JOIN exams e ON e.id = sa.exam_id
WHERE 
  sa.exit_count >= e.max_exits OR
  sa.window_switches > 10 OR
  sa.recovery_count > 3 OR
  sa.auto_submitted = true
ORDER BY sa.started_at DESC;

COMMENT ON VIEW suspicious_attempts_view IS 'Shows attempts with suspicious activity for monitoring';

-- ========================================
-- STEP 7: Create helper function to calculate remaining time
-- ========================================

CREATE OR REPLACE FUNCTION calculate_remaining_time(
  p_attempt_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_attempt RECORD;
  v_time_since_last_activity INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Get attempt data
  SELECT 
    sa.time_remaining_seconds,
    sa.last_activity,
    sa.started_at,
    e.duration_minutes
  INTO v_attempt
  FROM student_attempts sa
  JOIN exams e ON e.id = sa.exam_id
  WHERE sa.id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Calculate time since last activity
  v_time_since_last_activity := EXTRACT(EPOCH FROM (NOW() - v_attempt.last_activity));

  -- Safety check: if last_activity is unreasonably old, use stored time
  IF v_time_since_last_activity > (v_attempt.duration_minutes * 60) THEN
    v_remaining := v_attempt.time_remaining_seconds;
  ELSE
    -- Normal case: subtract elapsed time
    v_remaining := GREATEST(0, v_attempt.time_remaining_seconds - v_time_since_last_activity);
  END IF;

  RETURN v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_remaining_time IS 'Calculates actual remaining time for an attempt';

-- ========================================
-- STEP 8: Grant permissions
-- ========================================

-- Grant permissions for service role (used by Edge Functions and API)
-- These will work with service_role key

-- Grant permissions for anon role (needed for client queries)
GRANT SELECT ON suspicious_attempts_view TO anon;
GRANT SELECT ON attempt_recovery_log TO anon;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Run these to verify the migration succeeded:

-- 1. Check new columns exist
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'student_attempts' 
-- AND column_name IN ('auto_submitted', 'auto_submit_reason', 'recovery_count', 'last_recovery_at');

-- 2. Check recovery log table exists
-- SELECT COUNT(*) FROM attempt_recovery_log;

-- 3. Check indexes
-- SELECT indexname FROM pg_indexes WHERE tablename = 'student_attempts';

-- 4. Test RPC function
-- SELECT log_attempt_recovery(
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   'test',
--   '{"test": "old"}'::jsonb,
--   '{"test": "new"}'::jsonb
-- );

-- ========================================
-- ROLLBACK SCRIPT (if needed)
-- ========================================
-- ⚠️ ONLY RUN THIS IF YOU NEED TO UNDO THE MIGRATION

/*
-- Drop new columns
ALTER TABLE student_attempts 
DROP COLUMN IF EXISTS auto_submitted,
DROP COLUMN IF EXISTS auto_submit_reason,
DROP COLUMN IF EXISTS recovery_count,
DROP COLUMN IF EXISTS last_recovery_at;

-- Drop recovery log table
DROP TABLE IF EXISTS attempt_recovery_log CASCADE;

-- Drop constraints
ALTER TABLE student_attempts DROP CONSTRAINT IF EXISTS check_time_remaining_valid;
ALTER TABLE student_attempts DROP CONSTRAINT IF EXISTS check_auto_submit_reason;

-- Drop indexes
DROP INDEX IF EXISTS idx_unique_incomplete_attempt;
DROP INDEX IF EXISTS idx_incomplete_attempts_with_time;
DROP INDEX IF EXISTS idx_attempts_by_student_name;
DROP INDEX IF EXISTS idx_auto_submitted_attempts;

-- Drop functions
DROP FUNCTION IF EXISTS log_attempt_recovery;
DROP FUNCTION IF EXISTS calculate_remaining_time;

-- Drop view
DROP VIEW IF EXISTS suspicious_attempts_view;
*/
