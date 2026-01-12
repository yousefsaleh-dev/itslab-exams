-- =====================================================
-- DATABASE DIAGNOSTIC SCRIPT - exams_system_itslab
-- Run in Supabase SQL Editor to check all DB properties
-- =====================================================

-- ==============================
-- 1. ALL TABLES
-- ==============================
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;

-- ==============================
-- 2. ALL COLUMNS WITH DATA TYPES
-- ==============================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ==============================
-- 3. ROW LEVEL SECURITY STATUS
-- ==============================
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- ==============================
-- 4. ALL RLS POLICIES
-- ==============================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ==============================
-- 5. TABLE ROW COUNTS
-- ==============================
SELECT 
    'exams' as table_name, COUNT(*) as row_count FROM exams
UNION ALL
SELECT 'questions', COUNT(*) FROM questions
UNION ALL
SELECT 'options', COUNT(*) FROM options  
UNION ALL
SELECT 'student_attempts', COUNT(*) FROM student_attempts
UNION ALL
SELECT 'student_answers', COUNT(*) FROM student_answers
UNION ALL
SELECT 'admins', COUNT(*) FROM admins
UNION ALL
SELECT 'password_reset_tokens', COUNT(*) FROM password_reset_tokens;

-- ==============================
-- 6. PRIMARY KEYS
-- ==============================
SELECT 
    tc.table_name, 
    kcu.column_name,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ==============================
-- 7. FOREIGN KEYS
-- ==============================
SELECT
    tc.table_name as from_table,
    kcu.column_name as from_column,
    ccu.table_name AS to_table,
    ccu.column_name AS to_column,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ==============================
-- 8. INDEXES
-- ==============================
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ==============================
-- 9. UNIQUE CONSTRAINTS
-- ==============================
SELECT 
    tc.table_name,
    kcu.column_name,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ==============================
-- 10. CHECK CONSTRAINTS
-- ==============================
SELECT 
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ==============================
-- 11. TRIGGERS
-- ==============================
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ==============================
-- 12. FUNCTIONS
-- ==============================
SELECT 
    routine_name,
    routine_type,
    data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- ==============================  
-- 13. EXTENSIONS
-- ==============================
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
ORDER BY extname;

-- ==============================
-- 14. DATABASE SIZE
-- ==============================
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as database_size;

-- ==============================
-- 15. TABLE SIZES
-- ==============================
SELECT 
    relname as table_name,
    pg_size_pretty(pg_total_relation_size(relid)) as total_size,
    pg_size_pretty(pg_relation_size(relid)) as data_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- ==============================
-- 16. EXAM STATISTICS
-- ==============================
SELECT 
    e.id,
    e.title,
    e.is_active,
    e.duration_minutes,
    e.pass_score,
    e.max_exits,
    e.offline_grace_minutes,
    e.exit_warning_seconds,
    e.requires_access_code,
    (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
    (SELECT COUNT(*) FROM student_attempts sa WHERE sa.exam_id = e.id) as attempt_count,
    (SELECT COUNT(*) FROM student_attempts sa WHERE sa.exam_id = e.id AND sa.completed = true) as completed_count
FROM exams e
ORDER BY e.created_at DESC;

-- ==============================
-- 17. ADMIN ACCOUNTS
-- ==============================
SELECT 
    id,
    email,
    name,
    created_at,
    (SELECT COUNT(*) FROM exams e WHERE e.admin_id = admins.id) as exam_count
FROM admins
ORDER BY created_at DESC;
