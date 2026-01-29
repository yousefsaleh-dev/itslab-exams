
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    const { id: attemptId } = await params
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId')

    if (!adminId) {
        return NextResponse.json(
            { error: 'Admin ID is required' },
            { status: 400 }
        )
    }

    try {
        // 1. Fetch Attempt with Exam (Verify Exam Ownership)
        const { data: attempt, error: attemptError } = await supabase
            .from('student_attempts')
            .select(`
                *,
                exam:exams (
                    id,
                    title,
                    pass_score
                )
            `)
            .eq('id', attemptId)
            .single()

        if (attemptError || !attempt) {
            return NextResponse.json(
                { error: 'Attempt not found' },
                { status: 404 }
            )
        }

        // 2. Fetch Answers with Question and Options
        const { data: answers, error: answersError } = await supabase
            .from('student_answers')
            .select(`
                *,
                question:questions (
                    question_text,
                    points,
                    options (
                        id,
                        option_text,
                        is_correct
                    )
                )
            `)
            .eq('attempt_id', attemptId)

        if (answersError) throw answersError

        return NextResponse.json({
            success: true,
            attempt: {
                ...attempt,
                answers: answers || []
            }
        })

    } catch (error: any) {
        // console.error('Fetch Attempt Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch attempt details' },
            { status: 500 }
        )
    }
}
