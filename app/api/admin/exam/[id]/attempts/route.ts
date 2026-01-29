
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

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId')

    if (!adminId) {
        return NextResponse.json(
            { error: 'Admin ID is required' },
            { status: 400 }
        )
    }

    try {
        // 1. Verify exam belongs to admin
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .select('id')
            .eq('id', id)
            .eq('admin_id', adminId)
            .single()

        if (examError || !exam) {
            return NextResponse.json(
                { error: 'Exam not found or unauthorized' },
                { status: 404 }
            )
        }

        // 2. Fetch Attempts
        const { data: attempts, error: attemptsError } = await supabase
            .from('student_attempts')
            .select('*')
            .eq('exam_id', id)
            .order('started_at', { ascending: false })

        if (attemptsError) throw attemptsError

        let answers: any[] = []

        // 3. Fetch Answers if there are attempts
        if (attempts && attempts.length > 0) {
            const attemptIds = attempts.map(a => a.id)
            const { data: answersData, error: answersError } = await supabase
                .from('student_answers')
                .select('question_id, is_correct, attempt_id')
                .in('attempt_id', attemptIds)

            if (!answersError) {
                answers = answersData
            }
        }

        return NextResponse.json({
            success: true,
            attempts: attempts || [],
            answers
        })

    } catch (error: any) {
        return NextResponse.json(
            { error: 'Failed to fetch attempts' },
            { status: 500 }
        )
    }
}
