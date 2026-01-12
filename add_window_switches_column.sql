-- ========================================
-- MEDIUM-8 FIX: Add missing window_switches column
-- ========================================
-- This column is being updated in the code but doesn't exist in the database

ALTER TABLE student_attempts
ADD COLUMN IF NOT EXISTS window_switches INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN student_attempts.window_switches IS 'Number of times student switched windows/tabs during exam (window blur events)';
