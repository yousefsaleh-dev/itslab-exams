-- ============================================
-- Remove Question Bank Tables and Policies
-- Run this in Supabase SQL Editor
-- ============================================

-- Drop RLS policies first
DROP POLICY IF EXISTS "Admin owns question bank" ON question_bank;
DROP POLICY IF EXISTS "Question bank options access" ON question_bank_options;
DROP POLICY IF EXISTS "Service role only for bank options" ON question_bank_options;
DROP POLICY IF EXISTS "Admins can insert bank options" ON question_bank_options;
DROP POLICY IF EXISTS "Admins can update bank options" ON question_bank_options;
DROP POLICY IF EXISTS "Admins can delete bank options" ON question_bank_options;

-- Drop tables (cascade will remove foreign keys)
DROP TABLE IF EXISTS question_bank_options CASCADE;
DROP TABLE IF EXISTS question_bank CASCADE;

-- Verify removal
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%question_bank%';

-- Should return empty (0 rows)
