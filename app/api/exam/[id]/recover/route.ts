import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface RecoveryRequest {
    studentName: string
}

interface RecoveryResponse {
    success: boolean
    found: boolean
    expired?: boolean
    data?: {
        attemptId: string
        answers: Record<string, string>
        exitCount: number
        timeRemaining: number
        startedAt: string
        lastActivity: string
    }
    message?: string
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<RecoveryResponse>> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        const { id: examId } = await params
        const body: RecoveryRequest = await request.json()

        if (!body.studentName?.trim()) {
            return NextResponse.json({
                success: false,
                found: false,
                message: 'Student name is required'
            }, { status: 400 })
        }

        const studentName = body.studentName.trim()

        // console.log(`[Recovery] Attempting recovery for student: ${studentName}, exam: ${examId}`)

        // 1. Check for completed attempt first (case-insensitive)
        const { data: completedAttempt } = await supabase
            .from('student_attempts')
            .select('id, score, time_spent_seconds, completed_at')
            .eq('exam_id', examId)
            .ilike('student_name', studentName)
            .eq('completed', true)
            .maybeSingle()

        if (completedAttempt) {
            // console.log(`[Recovery] Found completed attempt for ${studentName}`)
            return NextResponse.json({
                success: true,
                found: true,
                expired: true,
                message: 'Exam already completed'
            })
        }

        // 2. Look for incomplete attempt
        const { data: incompleteAttempt, error: attemptError } = await supabase
            .from('student_attempts')
            .select(`
        id,
        started_at,
        last_activity,
        time_remaining_seconds,
        exit_count,
        exam:exams!inner (
          duration_minutes,
          is_active,
          max_exits
        )
      `)
            .eq('exam_id', examId)
            .ilike('student_name', studentName)
            .eq('completed', false)
            .maybeSingle()

        if (attemptError) {
            // console.error('[Recovery] Error fetching incomplete attempt:', attemptError)
            return NextResponse.json({
                success: false,
                found: false,
                message: 'Error retrieving attempt data'
            }, { status: 500 })
        }

        if (!incompleteAttempt) {
            // console.log(`[Recovery] No incomplete attempt found for ${studentName}`)
            return NextResponse.json({
                success: true,
                found: false,
                message: 'No incomplete attempt found'
            })
        }

        const examData = incompleteAttempt.exam as any

        if (!examData.is_active) {
            // console.log(`[Recovery] Exam not active for ${studentName}`)
            return NextResponse.json({
                success: false,
                found: true,
                message: 'Exam is no longer active'
            }, { status: 403 })
        }

        // 3. Calculate actual remaining time
        const now = Date.now()
        const lastActivity = new Date(incompleteAttempt.last_activity).getTime()
        const timeSinceLastActivity = Math.floor((now - lastActivity) / 1000)

        let remainingTime: number

        // Safety check: if last_activity is unreasonably old, use stored time
        if (timeSinceLastActivity > examData.duration_minutes * 60) {
            remainingTime = incompleteAttempt.time_remaining_seconds || 0
            // console.log(`[Recovery] Using stored time for ${studentName} (last activity too old)`)
        } else {
            // Normal case: subtract elapsed time
            remainingTime = Math.max(
                0,
                (incompleteAttempt.time_remaining_seconds || 0) - timeSinceLastActivity
            )
            // console.log(`[Recovery] Calculated remaining time: ${remainingTime}s for ${studentName}`)
        }

        // 4. Check if time expired
        if (remainingTime <= 0) {
            // console.log(`[Recovery] Time expired for ${studentName}`)
            return NextResponse.json({
                success: true,
                found: true,
                expired: true,
                message: 'Exam time has expired'
            })
        }

        // 5. Fetch saved answers
        const { data: savedAnswers, error: answersError } = await supabase
            .from('student_answers')
            .select('question_id, selected_option_id')
            .eq('attempt_id', incompleteAttempt.id)

        if (answersError) {
            // console.error('[Recovery] Error fetching answers:', answersError)
            return NextResponse.json({
                success: false,
                found: true,
                message: 'Error retrieving saved answers'
            }, { status: 500 })
        }

        const answersMap: Record<string, string> = {}
        if (savedAnswers) {
            savedAnswers.forEach((ans: any) => {
                if (ans.selected_option_id) {
                    answersMap[ans.question_id] = ans.selected_option_id
                }
            })
        }

        // console.log(`[Recovery] Found ${Object.keys(answersMap).length} saved answers for ${studentName}`)

        // 6. Log recovery attempt (no RPC - just console log for now)
        // console.log(`[Recovery] Session recovered for ${studentName}:`, {
        //     attemptId: incompleteAttempt.id,
        //     method: 'api_recovery',
        //     previousTimeRemaining: incompleteAttempt.time_remaining_seconds,
        //     newTimeRemaining: remainingTime,
        //     recoveryTime: new Date().toISOString()
        // })

        // 7. Update last_activity to NOW
        const { error: updateError } = await supabase
            .from('student_attempts')
            .update({
                last_activity: new Date().toISOString(),
                time_remaining_seconds: remainingTime
            })
            .eq('id', incompleteAttempt.id)

        if (updateError) {
            // console.error('[Recovery] Failed to update last_activity:', updateError)
            // Continue anyway - not critical
        }

        // 8. Return recovery data
        // console.log(`[Recovery] Successfully recovered attempt for ${studentName}`)
        return NextResponse.json({
            success: true,
            found: true,
            data: {
                attemptId: incompleteAttempt.id,
                answers: answersMap,
                exitCount: incompleteAttempt.exit_count || 0,
                timeRemaining: remainingTime,
                startedAt: incompleteAttempt.started_at,
                lastActivity: incompleteAttempt.last_activity
            },
            message: 'Attempt recovered successfully'
        })

    } catch (error) {
        // console.error('[Recovery] Fatal error:', error)
        return NextResponse.json({
            success: false,
            found: false,
            message: 'Internal server error during recovery'
        }, { status: 500 })
    }
}
