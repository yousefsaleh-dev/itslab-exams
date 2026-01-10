// Supabase Edge Function: Auto-Submit Expired Attempts
// This function runs every 2 minutes to check for expired exam attempts and auto-submit them
// 
// Deploy: supabase functions deploy auto-submit-expired
// Schedule: Create cron job in Supabase Dashboard: */2 * * * * (every 2 minutes)
//
// Environment variables needed:
// - SUPABASE_URL (auto-provided)
// - SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ExpiredAttempt {
  id: string
  exam_id: string
  student_name: string
  started_at: string
  last_activity: string
  time_remaining_seconds: number
  exam: {
    duration_minutes: number
    is_active: boolean
  }
}

interface ProcessingResult {
  success: boolean
  total: number
  submitted: number
  failed: number
  skipped: number
  errors: Array<{ attempt_id: string; error: string }>
}

Deno.serve(async (req) => {
  const startTime = Date.now()

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('🔍 [Auto-Submit] Starting check for expired attempts...')

    const now = new Date()

    // Find all incomplete attempts where time has expired
    // ONLY auto-submit when time_remaining_seconds <= 0
    // Do NOT auto-submit on inactivity - students may be thinking!
    const { data: attempts, error: fetchError } = await supabase
      .from('student_attempts')
      .select(`
        id,
        exam_id,
        student_name,
        started_at,
        last_activity,
        time_remaining_seconds,
        exam:exams!inner (
          duration_minutes,
          is_active
        )
      `)
      .eq('completed', false)
      .lte('time_remaining_seconds', 0) // Only when time expired

    if (fetchError) {
      console.error('❌ [Auto-Submit] Error fetching attempts:', fetchError)
      return new Response(JSON.stringify({
        success: false,
        error: fetchError.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!attempts || attempts.length === 0) {
      console.log('✅ [Auto-Submit] No expired attempts found')
      return new Response(JSON.stringify({
        success: true,
        message: 'No expired attempts',
        processed: 0,
        duration_ms: Date.now() - startTime
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`📋 [Auto-Submit] Found ${attempts.length} expired attempt(s)`)

    const result: ProcessingResult = {
      success: true,
      total: attempts.length,
      submitted: 0,
      failed: 0,
      skipped: 0,
      errors: []
    }

    for (const attempt of attempts as ExpiredAttempt[]) {
      try {
        const examData = attempt.exam

        // Skip if exam is no longer active
        if (!examData.is_active) {
          console.log(`⏭️  [Auto-Submit] Skipping attempt ${attempt.id} - exam not active`)
          result.skipped++
          continue
        }

        // Determine auto-submit reason
        const timeExpired = attempt.time_remaining_seconds <= 0

        const reason = timeExpired
          ? 'time_expired'
          : 'system_check'

        console.log(`⏱️  [Auto-Submit] Processing ${attempt.id} - Reason: ${reason}`)

        // Calculate time spent (cap at exam duration)
        const startTime = new Date(attempt.started_at).getTime()
        const elapsedSeconds = Math.floor((now.getTime() - startTime) / 1000)
        const maxTime = examData.duration_minutes * 60
        const timeSpent = Math.min(elapsedSeconds, maxTime)

        // Fetch student's saved answers
        const { data: savedAnswers, error: answersError } = await supabase
          .from('student_answers')
          .select('question_id, selected_option_id')
          .eq('attempt_id', attempt.id)

        if (answersError) {
          console.error(`❌ [Auto-Submit] Failed to fetch answers for ${attempt.id}:`, answersError)
          result.failed++
          result.errors.push({
            attempt_id: attempt.id,
            error: `Failed to fetch answers: ${answersError.message}`
          })

          // Mark attempt as failed rather than leaving it hanging
          await supabase
            .from('student_attempts')
            .update({
              auto_submitted: true,
              auto_submit_reason: 'system_error',
              completed: true,
              completed_at: now.toISOString(),
              score: 0
            })
            .eq('id', attempt.id)

          continue
        }

        // Build answers map
        const answersMap: Record<string, string> = {}
        if (savedAnswers) {
          savedAnswers.forEach((ans: any) => {
            if (ans.selected_option_id) {
              answersMap[ans.question_id] = ans.selected_option_id
            }
          })
        }

        // Fetch questions with correct answers
        const { data: questions, error: questionsError } = await supabase
          .from('questions')
          .select(`
            id,
            points,
            options (id, is_correct)
          `)
          .eq('exam_id', attempt.exam_id)

        if (questionsError || !questions) {
          console.error(`❌ [Auto-Submit] Failed to fetch questions for ${attempt.id}:`, questionsError)
          result.failed++
          result.errors.push({
            attempt_id: attempt.id,
            error: `Failed to fetch questions: ${questionsError?.message || 'Unknown error'}`
          })

          // Mark as failed
          await supabase
            .from('student_attempts')
            .update({
              auto_submitted: true,
              auto_submit_reason: 'system_error',
              completed: true,
              completed_at: now.toISOString(),
              score: 0
            })
            .eq('id', attempt.id)

          continue
        }

        // Calculate score
        let earnedPoints = 0
        const totalPoints = questions.reduce((sum: number, q: any) => sum + q.points, 0)
        const validatedAnswers = []

        for (const question of questions) {
          const studentSelectedId = answersMap[question.id]

          if (!studentSelectedId) {
            validatedAnswers.push({
              attempt_id: attempt.id,
              question_id: question.id,
              selected_option_id: null,
              is_correct: false
            })
            continue
          }

          const correctOption = question.options.find((opt: any) => opt.is_correct)
          const isCorrect = correctOption?.id === studentSelectedId

          if (isCorrect) {
            earnedPoints += question.points
          }

          validatedAnswers.push({
            attempt_id: attempt.id,
            question_id: question.id,
            selected_option_id: studentSelectedId,
            is_correct: isCorrect
          })
        }

        const finalScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0

        // Delete old answers (cleanup)
        const { error: deleteError } = await supabase
          .from('student_answers')
          .delete()
          .eq('attempt_id', attempt.id)

        if (deleteError) {
          console.warn(`⚠️  [Auto-Submit] Failed to delete old answers for ${attempt.id}:`, deleteError)
          // Continue anyway - not critical
        }

        // Insert validated answers
        const { error: insertError } = await supabase
          .from('student_answers')
          .insert(validatedAnswers)

        if (insertError) {
          console.error(`❌ [Auto-Submit] Failed to insert answers for ${attempt.id}:`, insertError)
          result.failed++
          result.errors.push({
            attempt_id: attempt.id,
            error: `Failed to insert answers: ${insertError.message}`
          })
          continue
        }

        // Mark as completed with auto_submitted flag
        const { error: updateError } = await supabase
          .from('student_attempts')
          .update({
            completed: true,
            score: finalScore,
            total_points: totalPoints,
            time_spent_seconds: timeSpent,
            completed_at: now.toISOString(),
            auto_submitted: true,
            auto_submit_reason: reason
          })
          .eq('id', attempt.id)
          .eq('completed', false) // Extra safety: only update if still incomplete

        if (updateError) {
          console.error(`❌ [Auto-Submit] Failed to update attempt ${attempt.id}:`, updateError)
          result.failed++
          result.errors.push({
            attempt_id: attempt.id,
            error: `Failed to update attempt: ${updateError.message}`
          })
          continue
        }

        console.log(`✅ [Auto-Submit] Submitted ${attempt.id} - Score: ${finalScore.toFixed(1)}% (${earnedPoints}/${totalPoints})`)
        result.submitted++

      } catch (error) {
        console.error(`❌ [Auto-Submit] Unexpected error processing ${attempt.id}:`, error)
        result.failed++
        result.errors.push({
          attempt_id: attempt.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const durationMs = Date.now() - startTime
    console.log(`🎉 [Auto-Submit] Completed in ${durationMs}ms - Submitted: ${result.submitted}, Failed: ${result.failed}, Skipped: ${result.skipped}`)

    return new Response(JSON.stringify({
      ...result,
      duration_ms: durationMs,
      timestamp: now.toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ [Auto-Submit] Fatal error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
