import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types
export interface Admin {
    id: string
    email: string
    name: string
    created_at: string
}

export interface Exam {
    id: string
    admin_id: string
    title: string
    description: string | null
    duration_minutes: number
    pass_score: number
    shuffle_questions: boolean
    shuffle_options: boolean
    show_results: boolean
    max_exits: number
    is_active: boolean
    created_at: string
}

export interface Question {
    id: string
    exam_id: string
    question_text: string
    question_order: number
    points: number
    options?: Option[]
}

export interface Option {
    id: string
    question_id: string
    option_text: string
    is_correct: boolean
    option_order: number
}

export interface StudentAttempt {
    id: string
    exam_id: string
    student_name: string
    score: number | null
    total_points: number | null
    time_spent_seconds: number | null
    time_remaining_seconds: number | null
    exit_count: number
    window_switches: number
    suspicious_activities: any[]
    completed: boolean
    started_at: string
    completed_at: string | null
    last_activity: string
}

export interface StudentAnswer {
    id: string
    attempt_id: string
    question_id: string
    selected_option_id: string | null
    is_correct: boolean | null
    answered_at: string
}