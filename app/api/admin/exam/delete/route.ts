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
        const { examId } = body

        if (!examId) {
            return NextResponse.json(
                { error: 'Exam ID required' },
                { status: 400 }
            )
        }

        const adminId = session.id

        // Fetch exam to verify ownership
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .select('id, admin_id, title')
            .eq('id', examId)
            .single()

        if (examError || !exam) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        // SECURITY: Verify admin owns this exam
        if (exam.admin_id !== adminId) {
            return NextResponse.json(
                { error: 'You do not have permission to delete this exam' },
                { status: 403 }
            )
        }

        // Delete exam (cascade deletes questions, options, attempts, answers via DB constraints)
        const { error: deleteError } = await supabase
            .from('exams')
            .delete()
            .eq('id', examId)

        if (deleteError) {
            console.error('Delete exam error:', deleteError)
            return NextResponse.json(
                { error: 'Failed to delete exam' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: `Exam "${exam.title}" deleted successfully`
        })

    } catch (error) {
        console.error('Delete exam error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
