import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        // SECURITY: Verify session
        const session = await getSession()
        if (!session || !session.id) {
            return NextResponse.json(
                { error: 'Unauthorized: Please login first' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { attemptId } = body

        if (!attemptId) {
            return NextResponse.json(
                { error: 'Attempt ID required' },
                { status: 400 }
            )
        }

        const adminId = session.id

        // Fetch attempt to get exam_id
        const { data: attempt, error: attemptError } = await supabase
            .from('student_attempts')
            .select('id, exam_id')
            .eq('id', attemptId)
            .single()

        if (attemptError || !attempt) {
            return NextResponse.json(
                { error: 'Attempt not found' },
                { status: 404 }
            )
        }

        // Fetch exam to verify ownership
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .select('id, admin_id')
            .eq('id', attempt.exam_id)
            .single()

        if (examError || !exam) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        // SECURITY: Verify admin owns the exam this attempt belongs to
        if (exam.admin_id !== adminId) {
            return NextResponse.json(
                { error: 'You do not have permission to modify this attempt' },
                { status: 403 }
            )
        }

        // Force finish the attempt
        const { error: updateError } = await supabase
            .from('student_attempts')
            .update({
                completed: true,
                completed_at: new Date().toISOString()
            })
            .eq('id', attemptId)

        if (updateError) {
            console.error('Force finish error:', updateError)
            return NextResponse.json(
                { error: 'Failed to update attempt' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Attempt marked as completed'
        })

    } catch (error) {
        console.error('Force finish error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
