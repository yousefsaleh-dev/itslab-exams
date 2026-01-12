-- ========================================
-- FIX: Update RLS policy to allow window_switches update
-- ========================================

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Update own attempts" ON student_attempts;

-- Create new policy that allows updating tracking fields
CREATE POLICY "Update own attempts"
ON student_attempts FOR UPDATE
TO anon
USING (completed = false)
WITH CHECK (true);  -- Allow updating any field while attempt is incomplete

-- This allows students to update:
-- - window_switches
-- - exit_count  
-- - time_remaining_seconds
-- - last_activity
-- - total_offline_seconds
-- - went_offline_at
-- - completed (when submitting)
