import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Use service role to bypass RLS (admins need to see options!)
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

        // Next.js 15+ requires awaiting params
        const { id: examId } = await params
        const adminId = session.id

        // Fetch Exam
        const { data: examData, error: examError } = await supabase
            .from('exams')
            .select('*')
            .eq('id', examId)
            .single()

        if (examError) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        // SECURITY: Verify admin owns this exam
        if (examData.admin_id !== adminId) {
            return NextResponse.json(
                { error: 'You do not have permission to view this exam' },
                { status: 403 }
            )
        }

        // Fetch Questions with Options (RLS bypass with service_role!)
        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select(`
        *,
        options (*)
      `)
            .eq('exam_id', examId)
            .order('question_order')

        if (questionsError) {
            return NextResponse.json(
                { error: 'Failed to load questions' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            exam: examData,
            questions: questionsData || []
        })

    } catch (error) {
        console.error('Get exam API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
