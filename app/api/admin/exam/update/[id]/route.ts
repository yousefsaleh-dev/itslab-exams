import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface UpdateExamRequest {
    title: string
    description: string
    duration_minutes: number
    pass_score: number
    shuffle_questions: boolean
    shuffle_options: boolean
    show_results: boolean
    max_exits: number
    offline_grace_minutes: number
    exit_warning_seconds: number
    requires_access_code?: boolean
    access_code?: string | null
    questions: Array<{
        question_text: string
        points: number
        options: Array<{
            option_text: string
            is_correct: boolean
        }>
    }>
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id: examId } = await params
        const body: UpdateExamRequest = await request.json()
        const adminId = session.id

        // Validate required fields
        if (!body.title?.trim()) {
            return NextResponse.json(
                { error: 'Exam title is required' },
                { status: 400 }
            )
        }

        if (!body.questions || body.questions.length === 0) {
            return NextResponse.json(
                { error: 'At least one question is required' },
                { status: 400 }
            )
        }

        // Verify exam exists and admin owns it
        const { data: existingExam, error: fetchError } = await supabase
            .from('exams')
            .select('id, admin_id')
            .eq('id', examId)
            .single()

        if (fetchError || !existingExam) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        if (existingExam.admin_id !== adminId) {
            return NextResponse.json(
                { error: 'Unauthorized - you do not own this exam' },
                { status: 403 }
            )
        }

        // Validate questions
        for (const q of body.questions) {
            if (!q.question_text?.trim()) {
                return NextResponse.json(
                    { error: 'All questions must have text' },
                    { status: 400 }
                )
            }
            if (!q.options.some(o => o.is_correct)) {
                return NextResponse.json(
                    { error: 'Each question must have a correct answer' },
                    { status: 400 }
                )
            }
            if (q.options.some(o => !o.option_text?.trim())) {
                return NextResponse.json(
                    { error: 'All options must have text' },
                    { status: 400 }
                )
            }
        }

        // SECURITY CHECK: Prevent question edits if students completed this exam
        const { data: completedAttempts, error: checkError } = await supabase
            .from('student_attempts')
            .select('id')
            .eq('exam_id', examId)
            .eq('completed', true)
            .limit(1)

        if (checkError) {
            console.error('Error checking completed attempts:', checkError)
            throw checkError
        }

        const { error: examError } = await supabase
            .from('exams')
            .update({
                title: body.title,
                description: body.description,
                duration_minutes: body.duration_minutes,
                pass_score: body.pass_score,
                shuffle_questions: body.shuffle_questions,
                shuffle_options: body.shuffle_options,
                show_results: body.show_results,
                max_exits: body.max_exits,
                offline_grace_minutes: body.offline_grace_minutes,
                exit_warning_seconds: body.exit_warning_seconds,
                requires_access_code: body.requires_access_code || false,
                access_code: body.access_code || null
            })
            .eq('id', examId)

        if (examError) {
            console.error('Exam update error:', examError)
            throw examError
        }

        // CHECK: If exam has completed attempts, only allow settings update
        if (completedAttempts && completedAttempts.length > 0) {
            return NextResponse.json({
                success: true,
                examId: examId,
                settingsOnly: true,
                message: 'Exam settings updated. Questions are locked (students have completed this exam)'
            })
        }

        // Safe to update questions - no completed attempts yet
        // Strategy: Delete all questions/options, then re-insert (prevents duplication)

        // Step 1: Get all existing question IDs
        const { data: existingQuestions } = await supabase
            .from('questions')
            .select('id')
            .eq('exam_id', examId)

        // Step 2: Delete existing questions and options
        if (existingQuestions && existingQuestions.length > 0) {
            const questionIds = existingQuestions.map(q => q.id)

            // Delete options first (avoid FK issues)
            await supabase
                .from('options')
                .delete()
                .in('question_id', questionIds)

            // Delete questions
            await supabase
                .from('questions')
                .delete()
                .eq('exam_id', examId)
        }

        // Step 3: Insert all current questions fresh
        for (let i = 0; i < body.questions.length; i++) {
            const q = body.questions[i]

            const { data: questionData, error: questionError } = await supabase
                .from('questions')
                .insert([{
                    exam_id: examId,
                    question_text: q.question_text,
                    question_order: i,
                    points: q.points
                }])
                .select()
                .single()

            if (questionError) {
                console.error('Question update error:', questionError)
                throw questionError
            }

            // Insert options
            const optionsToInsert = q.options.map((opt, optIdx) => ({
                question_id: questionData.id,
                option_text: opt.option_text,
                is_correct: opt.is_correct,
                option_order: optIdx
            }))

            const { error: optionsError } = await supabase
                .from('options')
                .insert(optionsToInsert)

            if (optionsError) {
                console.error('Options update error:', optionsError)
                throw optionsError
            }
        }

        return NextResponse.json({
            success: true,
            examId: examId,
            questionCount: body.questions.length
        })

    } catch (error: any) {
        console.error('Update exam API error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update exam' },
            { status: 500 }
        )
    }
}
