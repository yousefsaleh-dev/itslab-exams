import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface DeleteAttemptRequest {
    attemptId: string
    adminId: string
}

export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        const body: DeleteAttemptRequest = await request.json()
        const { attemptId, adminId } = body

        if (!attemptId) {
            return NextResponse.json(
                { error: 'Attempt ID required' },
                { status: 400 }
            )
        }

        // SECURITY: Require admin authentication
        if (!adminId) {
            return NextResponse.json(
                { error: 'Admin authentication required' },
                { status: 401 }
            )
        }

        // Verify admin exists
        const { data: admin, error: adminError } = await supabase
            .from('admins')
            .select('id')
            .eq('id', adminId)
            .single()

        if (adminError || !admin) {
            return NextResponse.json(
                { error: 'Invalid admin credentials' },
                { status: 401 }
            )
        }

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
                { error: 'You do not have permission to delete this attempt' },
                { status: 403 }
            )
        }

        // Delete associated answers first (cascade should handle this, but being explicit)
        await supabase
            .from('student_answers')
            .delete()
            .eq('attempt_id', attemptId)

        // Delete the attempt
        const { error: deleteError } = await supabase
            .from('student_attempts')
            .delete()
            .eq('id', attemptId)

        if (deleteError) {
            console.error('Delete attempt error:', deleteError)
            return NextResponse.json(
                { error: 'Failed to delete attempt' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Attempt deleted successfully'
        })

    } catch (error) {
        console.error('Delete attempt error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
