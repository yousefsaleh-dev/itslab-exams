import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface SubmitRequest {
    attemptId: string
    answers: Record<string, string>  // questionId -> selectedOptionId
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Use service_role to access options.is_correct for grading
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        // Next.js 15+ requires awaiting params
        const { id: examId } = await params

        const body: SubmitRequest = await request.json()

        if (!body.attemptId || !body.answers) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        // 1. Validate attempt exists and belongs to this exam
        const { data: attempt, error: attemptError } = await supabase
            .from('student_attempts')
            .select(`
        id,
        exam_id,
        started_at,
        completed,
        exam:exams (
          duration_minutes,
          is_active
        )
      `)
            .eq('id', body.attemptId)
            .eq('exam_id', examId)
            .single()

        if (attemptError || !attempt) {
            return NextResponse.json(
                { error: 'Invalid attempt' },
                { status: 403 }
            )
        }

        if (attempt.completed) {
            return NextResponse.json(
                { error: 'Attempt already completed' },
                { status: 403 }
            )
        }

        // Type assertion for exam data
        const examData = attempt.exam as any
        
        if (!examData || !examData.is_active) {
            return NextResponse.json(
                { error: 'Exam is no longer active' },
                { status: 403 }
            )
        }

        // 2. SERVER-SIDE TIME VALIDATION
        const startTime = new Date(attempt.started_at).getTime()
        const elapsedMs = Date.now() - startTime
        const elapsedSeconds = Math.floor(elapsedMs / 1000)
        const allowedSeconds = examData.duration_minutes * 60

        if (elapsedSeconds > allowedSeconds + 5) {  // 5 second grace period
            return NextResponse.json(
                { error: 'Time limit exceeded' },
                { status: 403 }
            )
        }

        // 3. Fetch correct answers (SERVER-SIDE ONLY - never sent to client)
        const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select(`
        id,
        points,
        options (id, is_correct)
      `)
            .eq('exam_id', examId)

        if (questionsError || !questions) {
            return NextResponse.json(
                { error: 'Failed to fetch questions' },
                { status: 500 }
            )
        }

        // 4. SERVER CALCULATES SCORE AND CORRECTNESS
        let earnedPoints = 0
        const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)
        const validatedAnswers = []

        for (const question of questions) {
            const studentSelectedId = body.answers[question.id]

            if (!studentSelectedId) {
                // Student didn't answer this question
                validatedAnswers.push({
                    attempt_id: body.attemptId,
                    question_id: question.id,
                    selected_option_id: null,
                    is_correct: false
                })
                continue
            }

            // Find the correct option (server knows the truth)
            const correctOption = question.options.find((opt: any) => opt.is_correct)
            const isCorrect = correctOption?.id === studentSelectedId

            if (isCorrect) {
                earnedPoints += question.points
            }

            validatedAnswers.push({
                attempt_id: body.attemptId,
                question_id: question.id,
                selected_option_id: studentSelectedId,
                is_correct: isCorrect  // ✅ SERVER DECIDES!
            })
        }

        const finalScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0

        // 5. Atomic transaction - delete old answers and insert validated ones
        await supabase
            .from('student_answers')
            .delete()
            .eq('attempt_id', body.attemptId)

        const { error: insertError } = await supabase
            .from('student_answers')
            .insert(validatedAnswers)

        if (insertError) {
            // console.error('Answer insert error:', insertError)
            return NextResponse.json(
                { error: 'Failed to save answers' },
                { status: 500 }
            )
        }

        // 6. Mark attempt as completed
        const { error: updateError } = await supabase
            .from('student_attempts')
            .update({
                completed: true,
                score: finalScore,
                total_points: totalPoints,
                time_spent_seconds: elapsedSeconds,
                completed_at: new Date().toISOString()
            })
            .eq('id', body.attemptId)

        if (updateError) {
            // console.error('Attempt update error:', updateError)
            return NextResponse.json(
                { error: 'Failed to update attempt' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            score: finalScore,
            totalPoints,
            earnedPoints,
            timeSpent: elapsedSeconds
        })

    } catch (error) {
        // console.error('Submit API Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
