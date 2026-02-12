import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Use service_role to bypass RLS, but we explicitly exclude is_correct!
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        // Next.js 15+ requires awaiting params
        const { id: examId } = await params

        // 1. Fetch exam details (include requires_access_code but NOT access_code)
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .select('id, title, description, duration_minutes, pass_score, shuffle_questions, shuffle_options, show_results, max_exits, offline_grace_minutes, exit_warning_seconds, is_active, requires_access_code, admin:admins(name)')
            .eq('id', examId)
            .single()

        if (examError || !exam) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        if (!exam.is_active) {
            return NextResponse.json(
                { error: 'Exam is not active' },
                { status: 403 }
            )
        }

        // 2. Fetch questions WITHOUT is_correct field
        // CRITICAL SECURITY: We explicitly exclude is_correct from options
        const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select(`
        id,
        question_text,
        question_order,
        points,
        options (
          id,
          option_text,
          option_order
        )
      `)
            .eq('exam_id', examId)
            .order('question_order')

        if (questionsError) {
            // console.error('Questions fetch error:', questionsError)
            return NextResponse.json(
                { error: 'Failed to fetch questions' },
                { status: 500 }
            )
        }

        // 3. Return exam + questions (WITHOUT correct answers)
        return NextResponse.json({
            exam: {
                id: exam.id,
                title: exam.title,
                description: exam.description,
                duration_minutes: exam.duration_minutes,
                pass_score: exam.pass_score,
                max_exits: exam.max_exits,
                shuffle_questions: exam.shuffle_questions,
                shuffle_options: exam.shuffle_options,
                show_results: exam.show_results,
                offline_grace_minutes: exam.offline_grace_minutes || 10,
                exit_warning_seconds: exam.exit_warning_seconds || 10,
                requires_access_code: exam.requires_access_code || false,
                instructor_name: (exam as any).admin?.name || null
            },
            questions
        })

    } catch (error) {
        // console.error('API Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
