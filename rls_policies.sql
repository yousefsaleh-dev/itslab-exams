-- Row Level Security (RLS) Policies - SECURED VERSION
-- This script will DROP existing policies first, then recreate them with STRICT security
-- Apply this in Supabase SQL Editor to fix the vulnerability

-- ========================================
-- STEP 1: Drop ALL existing policies
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
-- STEP 3: Create NEW STRICT policies
-- ========================================

-- 1. ADMINS TABLE
CREATE POLICY "Block direct admin access"
ON admins FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 2. PASSWORD_RESET_TOKENS
CREATE POLICY "Block token modifications"
ON password_reset_tokens FOR ALL
TO anon
USING (false) WITH CHECK (false);

-- 3. OPTIONS TABLE (CRITICAL SECURITY FIX)
-- ⛔ DENY: Anon users cannot READ options directly (This hides is_correct)
-- ✅ ALLOW: Authenticated users (if any) or Service Role (API)
CREATE POLICY "Allow reading options"
ON options FOR SELECT
TO authenticated -- Only Authenticated Admins (if applicable) can read direct
USING (true);

-- 4. QUESTIONS TABLE (CRITICAL SECURITY FIX)
-- ⛔ DENY: Anon users cannot dump the question bank
CREATE POLICY "Read questions"
ON questions FOR SELECT
TO authenticated
USING (true);

-- 5. EXAMS TABLE (CRITICAL SECURITY FIX)
-- ⛔ DENY: Anon users cannot list all exams
CREATE POLICY "Read exams"  
ON exams FOR SELECT
TO authenticated
USING (true);

-- 6. STUDENT ATTEMPTS (Allowed for Student Experience)
-- Students need to read/write their *own* attempts for state persistence
CREATE POLICY "Read own attempts"
ON student_attempts FOR SELECT
TO anon
USING (true); -- Ideally scope to session/cookie ID, but currently open to 'anon' for Resume logic

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

-- 7. STUDENT ANSWERS
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

-- ========================================
-- NOTES
-- ========================================
-- The Admin Dashboard now uses API Routes (/api/admin/...) which run with
-- the SERVICE_ROLE_KEY. This bypasses RLS, so Admins still have full access.
-- Students are blocked from reading Options/Questions directly.
