import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface CloneExamRequest {
    examId: string
    adminId: string  // Required for authentication
}

export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        const body: CloneExamRequest = await request.json()
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

        // Fetch exam and questions with options
        const [examResult, questionsResult] = await Promise.all([
            supabase.from('exams').select('*').eq('id', examId).single(),
            supabase.from('questions').select('*, options(*)').eq('exam_id', examId)
        ])

        if (examResult.error || !examResult.data) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        // SECURITY: Verify admin owns this exam
        if (examResult.data.admin_id !== adminId) {
            return NextResponse.json(
                { error: 'You do not have permission to clone this exam' },
                { status: 403 }
            )
        }

        if (questionsResult.error) {
            return NextResponse.json(
                { error: 'Failed to fetch questions' },
                { status: 500 }
            )
        }

        const examData = examResult.data
        const questionsData = questionsResult.data || []

        // Clone exam - keep admin_id to maintain ownership
        const { id, created_at, ...examDataToClone } = examData
        const { data: newExam, error: newExamError } = await supabase
            .from('exams')
            .insert([{
                ...examDataToClone,
                title: `Copy of ${examData.title}`,
                is_active: false // Default to inactive
            }])
            .select()
            .single()

        if (newExamError) {
            return NextResponse.json(
                { error: 'Failed to clone exam' },
                { status: 500 }
            )
        }

        // Defensive check: Ensure newExam.id is valid
        if (!newExam?.id) {
            return NextResponse.json(
                { error: 'Failed to create exam - invalid ID' },
                { status: 500 }
            )
        }

        // Clone questions
        const questionsToInsert = questionsData.map((q: any) => ({
            exam_id: newExam.id,
            question_text: q.question_text,
            question_order: q.question_order,
            points: q.points
        }))

        const { data: newQuestions, error: questionsError } = await supabase
            .from('questions')
            .insert(questionsToInsert)
            .select()

        if (questionsError) {
            // Cleanup
            await supabase.from('exams').delete().eq('id', newExam.id)
            return NextResponse.json(
                { error: 'Failed to clone questions' },
                { status: 500 }
            )
        }

        // Clone options - use question_order for reliable matching
        // Create a map from question_order to new question ID
        const newQuestionsMap = new Map(
            newQuestions.map((q: any) => [q.question_order, q])
        )

        const allOptions = questionsData.flatMap((originalQuestion: any) => {
            const newQ = newQuestionsMap.get(originalQuestion.question_order)
            if (!newQ) {
                // console.warn(`No matching question found for order ${originalQuestion.question_order}`)
                return []
            }
            return originalQuestion.options.map((o: any) => ({
                question_id: newQ.id,
                option_text: o.option_text,
                is_correct: o.is_correct,
                option_order: o.option_order
            }))
        })

        const { error: optionsError } = await supabase
            .from('options')
            .insert(allOptions)

        if (optionsError) {
            // Cleanup
            await supabase.from('exams').delete().eq('id', newExam.id)
            return NextResponse.json(
                { error: 'Failed to clone options' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            examId: newExam.id,
            questionCount: newQuestions.length
        })

    } catch (error) {
        // console.error('Clone exam error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
