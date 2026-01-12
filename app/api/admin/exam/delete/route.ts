import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface DeleteExamRequest {
    examId: string
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
        const body: DeleteExamRequest = await request.json()
        const { examId, adminId } = body

        if (!examId) {
            return NextResponse.json(
                { error: 'Exam ID required' },
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
