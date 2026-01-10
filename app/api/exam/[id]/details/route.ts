import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
        // Next.js 15+ requires awaiting params
        const { id: examId } = await params

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
        // console.error('Get exam API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
