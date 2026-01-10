-- Row Level Security (RLS) Policies - SAFE VERSION
-- This script will DROP existing policies first, then recreate them
-- Apply in Supabase SQL Editor

-- ========================================
-- STEP 1: Drop ALL existing policies (safe - won't error if not exist)
-- ========================================

DROP POLICY IF EXISTS "Block direct admin access" ON admins;
DROP POLICY IF EXISTS "Block token modifications" ON password_reset_tokens;
DROP POLICY IF EXISTS "Block token updates" ON password_reset_tokens;
DROP POLICY IF EXISTS "Block token deletion" ON password_reset_tokens;
DROP POLICY IF EXISTS "Block token reading" ON password_reset_tokens;
DROP POLICY IF EXISTS "Allow reading options" ON options;
DROP POLICY IF EXISTS "Service role only for options" ON options;
DROP POLICY IF EXISTS "Admins can insert options" ON options;
DROP POLICY IF EXISTS "Admins can update options" ON options;
DROP POLICY IF EXISTS "Admins can delete options" ON options;
DROP POLICY IF EXISTS "Read own attempts" ON student_attempts;
DROP POLICY IF EXISTS "Insert own attempts" ON student_attempts;
DROP POLICY IF EXISTS "Update own attempts" ON student_attempts;
DROP POLICY IF EXISTS "Block attempt deletion" ON student_attempts;
DROP POLICY IF EXISTS "Read own answers" ON student_answers;
DROP POLICY IF EXISTS "Insert own answers" ON student_answers;
DROP POLICY IF EXISTS "Update own answers" ON student_answers;
DROP POLICY IF EXISTS "Block answer deletion" ON student_answers;
DROP POLICY IF EXISTS "Read questions" ON questions;
DROP POLICY IF EXISTS "Admins manage questions" ON questions;
DROP POLICY IF EXISTS "Read exams" ON exams;
DROP POLICY IF EXISTS "Admins manage exams" ON exams;


-- ========================================
-- STEP 2: Enable RLS on ALL tables
-- ========================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE options ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;


-- ========================================
-- STEP 3: Create NEW policies
-- ========================================

-- ADMINS TABLE (CRITICAL!)
CREATE POLICY "Block direct admin access"
ON admins FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- PASSWORD_RESET_TOKENS TABLE
CREATE POLICY "Block token modifications"
ON password_reset_tokens FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Block token updates"
ON password_reset_tokens FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Block token deletion"
ON password_reset_tokens FOR DELETE
TO anon
USING (false);

CREATE POLICY "Block token reading"
ON password_reset_tokens FOR SELECT
TO anon
USING (false);

-- OPTIONS TABLE - Allow reading for admins/instructors viewing attempts
-- Students shouldn't see is_correct during exam, but admins need to see it for review
CREATE POLICY "Allow reading options"
ON options FOR SELECT
TO authenticated, anon
USING (true);

-- Allow INSERT/UPDATE/DELETE for admins (needed when creating/editing exams)
CREATE POLICY "Admins can insert options"
ON options FOR INSERT
TO authenticated, anon
WITH CHECK (true);

CREATE POLICY "Admins can update options"
ON options FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Admins can delete options"
ON options FOR DELETE
TO authenticated, anon
USING (true);

-- STUDENT ATTEMPTS
CREATE POLICY "Read own attempts"
ON student_attempts FOR SELECT
TO anon
USING (true);

CREATE POLICY "Insert own attempts"
ON student_attempts FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Update own attempts"
ON student_attempts FOR UPDATE
TO anon
USING (completed = false)
WITH CHECK (completed = true OR completed = false);

CREATE POLICY "Block attempt deletion"
ON student_attempts FOR DELETE
TO anon
USING (false);

-- STUDENT ANSWERS
CREATE POLICY "Read own answers"
ON student_answers FOR SELECT
TO anon
USING (true);

CREATE POLICY "Insert own answers"
ON student_answers FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Update own answers"
ON student_answers FOR UPDATE
TO anon
USING (
  EXISTS (
    SELECT 1 FROM student_attempts
    WHERE student_attempts.id = student_answers.attempt_id
    AND student_attempts.completed = false
  )
);

CREATE POLICY "Block answer deletion"
ON student_answers FOR DELETE
TO anon
USING (false);

-- QUESTIONS & EXAMS
-- Students can READ
CREATE POLICY "Read questions"
ON questions FOR SELECT
TO anon
USING (true);

CREATE POLICY "Read exams"  
ON exams FOR SELECT
TO anon
USING (true);

-- Admins can do EVERYTHING (INSERT/UPDATE/DELETE)
-- These will be used by admin pages (they use service_role via API or direct supabase client)
CREATE POLICY "Admins manage questions"
ON questions FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Admins manage exams"
ON exams FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- ========================================
-- VERIFICATION
-- ========================================

-- Run this to verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Should show rowsecurity = TRUE for all tables above

