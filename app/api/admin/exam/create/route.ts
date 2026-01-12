import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface CreateExamRequest {
    adminId: string
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

export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        const body: CreateExamRequest = await request.json()

        // Validate required fields
        if (!body.adminId || !body.title?.trim()) {
            return NextResponse.json(
                { error: 'Admin ID and title are required' },
                { status: 400 }
            )
        }

        if (!body.questions || body.questions.length === 0) {
            return NextResponse.json(
                { error: 'At least one question is required' },
                { status: 400 }
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

        // Validate access code if required
        if (body.requires_access_code && (!body.access_code || !body.access_code.trim())) {
            return NextResponse.json(
                { error: 'Access code is required when access code protection is enabled' },
                { status: 400 }
            )
        }

        const { data: examData, error: examError } = await supabase
            .from('exams')
            .insert([{
                admin_id: body.adminId,
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
                access_code: body.access_code || null,
                is_active: true
            }])
            .select()
            .single()

        if (examError) {
            console.error('Exam creation error:', examError)
            throw examError
        }

        const examId = examData.id

        // Insert questions and options
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
                console.error('Question creation error:', questionError)
                // Cleanup: delete exam if question fails
                await supabase.from('exams').delete().eq('id', examId)
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
                console.error('Options creation error:', optionsError)
                // Cleanup: delete exam if options fail
                await supabase.from('exams').delete().eq('id', examId)
                throw optionsError
            }
        }

        return NextResponse.json({
            success: true,
            examId: examId,
            questionCount: body.questions.length
        })

    } catch (error: any) {
        console.error('Create exam API error:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create exam' },
            { status: 500 }
        )
    }
}
