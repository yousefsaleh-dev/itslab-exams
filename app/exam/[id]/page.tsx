'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Exam, Question, Option } from '@/lib/supabase'
import { useExamStore } from '@/lib/store'
import { Clock, AlertTriangle, CheckCircle, XCircle, WifiOff, PlayCircle, FileText, Timer, ClipboardList, Target, Award, DoorOpen, Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import { useExamProtection } from '@/hooks/useExamProtection'

type ExamQuestion = Question & { options: Option[] }

export default function StudentExamPage() {
    const params = useParams()

    // States
    const [phase, setPhase] = useState<'start' | 'resume' | 'exam' | 'result'>('start')
    const [studentName, setStudentName] = useState('')
    const [exam, setExam] = useState<Exam | null>(null)
    const [questions, setQuestions] = useState<ExamQuestion[]>([])
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [timeLeft, setTimeLeft] = useState(0)
    const [exitWarningActive, setExitWarningActive] = useState(false)
    const [warningCountdown, setWarningCountdown] = useState(10)

    // FIX #3 & #5: useRef for current values to avoid stale closures
    const timeLeftRef = useRef(timeLeft)
    const warningCountdownRef = useRef(10)
    const [score, setScore] = useState<number | null>(null)
    const [totalPoints, setTotalPoints] = useState(0)
    const [isOnline, setIsOnline] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [examError, setExamError] = useState<string | null>(null)
    const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false) // Prevent multiple submit attempts
    const [submitRetryCount, setSubmitRetryCount] = useState(0)
    const [isExamInactive, setIsExamInactive] = useState(false)
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [timeSpent, setTimeSpent] = useState(0)
    const [resumeAttempt, setResumeAttempt] = useState<any>(null)
    const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({})
    const [fontSize, setFontSize] = useState<'base' | 'lg' | 'xl'>('base')

    // Access code modal state
    const [showAccessCodeModal, setShowAccessCodeModal] = useState(false)
    const [accessCodeInput, setAccessCodeInput] = useState('')
    const [accessCodeError, setAccessCodeError] = useState('')
    const [verifyingAccessCode, setVerifyingAccessCode] = useState(false)
    const [pendingStudentName, setPendingStudentName] = useState('')

    // Offline grace period state
    const [totalOfflineSeconds, setTotalOfflineSeconds] = useState(0)
    const [currentOfflineDuration, setCurrentOfflineDuration] = useState(0)
    const blurCountRef = useRef(0) // MEDIUM-3 fix: persist blur count across re-renders

    // Timer warnings state
    const [warningShown5min, setWarningShown5min] = useState(false)
    const [warningShown1min, setWarningShown1min] = useState(false)

    // Security tracking
    const [devToolsDetected, setDevToolsDetected] = useState(false)
    const copyAttemptsRef = useRef(0)

    const { attemptId, answers, exitCount, setAttemptId, setAnswer, incrementExitCount, reset, setExitCount } = useExamStore()

    // Refs
    const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const exitWarningActiveRef = useRef<boolean>(false)

    // ====== SYNC WARNING COUNTDOWN WHEN EXAM LOADS ======
    useEffect(() => {
        if (exam?.exit_warning_seconds) {
            setWarningCountdown(exam.exit_warning_seconds)
            warningCountdownRef.current = exam.exit_warning_seconds
        }
    }, [exam])

    const submitExamRef = useRef<(() => Promise<void>) | null>(null)
    const lastSyncTimeRef = useRef<number>(0)
    const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    // ====== UTILITY FUNCTIONS ======
    const shuffleArray = <T,>(array: T[]): T[] => {
        const newArray = [...array]
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]]
        }
        return newArray
    }

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const enterFullScreen = () => {
        const elem = document.documentElement
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(() => {
                toast.error('Fullscreen is required for this exam')
            })
        }
    }

    // ====== FETCH EXAM DATA ======
    const fetchExam = async () => {
        try {
            // SECURITY FIX: Use API route that excludes is_correct field
            const response = await fetch(`/api/exam/${params.id}/questions`)

            if (!response.ok) {
                const error = await response.json()
                if (response.status === 403) {
                    setIsExamInactive(true)
                    return
                }
                setExamError(error.error || 'Failed to load exam')
                return
            }

            const { exam: examData, questions: questionsData } = await response.json()

            setExam(examData)

            // Update warning countdown from loaded exam
            if (examData?.exit_warning_seconds) {
                setWarningCountdown(examData.exit_warning_seconds)
                warningCountdownRef.current = examData.exit_warning_seconds
            }

            let processedQuestions = questionsData as ExamQuestion[]

            if (processedQuestions.length === 0) {
                setExamError('This exam has no questions. Please contact the instructor.')
                return
            }

            if (examData.shuffle_questions) {
                processedQuestions = shuffleArray(processedQuestions)
            }

            if (examData.shuffle_options) {
                processedQuestions = processedQuestions.map(q => ({
                    ...q,
                    options: shuffleArray(q.options)
                }))
            }

            setQuestions(processedQuestions)
            setTotalPoints(processedQuestions.reduce((sum, q) => sum + q.points, 0))

        } catch (error) {
            // console.error('Error fetching exam:', error)
            setExamError('Failed to load exam.')
        }
    }

    // ====== AUTO SUBMIT EXPIRED ATTEMPT ======
    const autoSubmitExpiredAttempt = async (attemptId: string, examData: Exam, questions: ExamQuestion[]) => {
        try {
            // FIX #1 (CRITICAL): Use secure server API instead of client calculation
            const currentAnswers = useExamStore.getState().answers || {}

            const response = await fetch(`/api/exam/${examData.id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attemptId,
                    answers: currentAnswers
                })
            })

            if (!response.ok) {
                throw new Error('Failed to submit exam')
            }

            const { score: finalScore, timeSpent: finalTimeSpent } = await response.json()

            setScore(finalScore)
            setTimeSpent(finalTimeSpent)
            setPhase('result')
        } catch (error) {
            // console.error('Error auto-submitting:', error)
            toast.error('Failed to auto-submit exam. Please contact support.')
        }
    }

    // ====== SECURITY CALLBACKS ======
    const handleDevToolsDetected = useCallback(async () => {
        if (!attemptId) return

        // Only set state once to avoid multiple toasts
        if (!devToolsDetected) {
            setDevToolsDetected(true)
            toast.error('Developer tools detected! This is being recorded.', {
                duration: 5000
            })
        }

        // Fetch current suspicious_activities
        const { data: attempt, error: fetchError } = await supabase
            .from('student_attempts')
            .select('suspicious_activities')
            .eq('id', attemptId)
            .single()

        if (fetchError) {
            // console.error('❌ Failed to fetch attempt:', fetchError)
            return
        }

        const activities = Array.isArray(attempt?.suspicious_activities) ? attempt.suspicious_activities : []
        activities.push({
            type: 'devtools_detected',
            timestamp: new Date().toISOString(),
            details: 'Developer tools detected'
        })

        // Update DB
        const { error } = await supabase.from('student_attempts').update({
            suspicious_activities: activities,
            last_activity: new Date().toISOString()
        }).eq('id', attemptId)

        if (error) {
            // console.error('❌ Failed to update devtools:', error)
        } else {
            // console.log('✅ DevTools logged')
        }
    }, [attemptId, devToolsDetected])

    const handleCopyAttempt = useCallback(async (customMessage?: string) => {
        if (!attemptId) return

        copyAttemptsRef.current++

        // Fetch current suspicious_activities
        const { data: attempt, error: fetchError } = await supabase
            .from('student_attempts')
            .select('suspicious_activities')
            .eq('id', attemptId)
            .single()

        if (fetchError) {
            console.error('❌ Failed to fetch attempt:', fetchError)
            return
        }

        const activities = Array.isArray(attempt?.suspicious_activities) ? attempt.suspicious_activities : []
        activities.push({
            type: 'copy_attempt',
            timestamp: new Date().toISOString(),
            details: customMessage || `Copy attempt #${copyAttemptsRef.current}`
        })

        // Update DB  
        const { error } = await supabase.from('student_attempts').update({
            suspicious_activities: activities,
            last_activity: new Date().toISOString()
        }).eq('id', attemptId)

        if (error) {
            // console.error('❌ Failed to update copy:', error)
        } else {
            // console.log(`✅ Copy attempt #${copyAttemptsRef.current} - updated DB`)
        }
    }, [attemptId])

    // ====== USE EXAM PROTECTION HOOK ======
    useExamProtection({
        phase,
        attemptId,
        timeLeft,
        onDevToolsDetected: handleDevToolsDetected,
        onCopyAttempt: handleCopyAttempt,
        warningShown5min,
        warningShown1min,
        setWarningShown5min,
        setWarningShown1min
    })

    // ====== START EXAM ======
    const startExam = async (savedStudentName?: string) => {

        if (!isOnline) {
            toast.error('Cannot start exam while offline')
            return
        }

        const examStudentName = savedStudentName || studentName
        if (!examStudentName.trim()) {
            toast.error('Please enter your name')
            return
        }

        if (!exam) {
            toast.error('Exam not loaded yet. Please wait.')
            return
        }

        // ====== SERVER-SIDE ACCESS CODE VERIFICATION ======
        if (exam.requires_access_code) {
            // Show custom modal instead of browser prompt
            setPendingStudentName(examStudentName)
            setShowAccessCodeModal(true)
            setAccessCodeInput('')
            setAccessCodeError('')
            return // Will continue via handleAccessCodeSubmit
        }

        // No access code required - proceed directly
        await proceedWithExamStart(examStudentName)
    }

    // ====== HANDLE ACCESS CODE SUBMISSION ======
    const handleAccessCodeSubmit = async () => {
        if (!accessCodeInput.trim()) {
            setAccessCodeError('Please enter the access code')
            return
        }

        setVerifyingAccessCode(true)
        setAccessCodeError('')

        try {
            const verifyResponse = await fetch(`/api/exam/${params.id}/verify-access-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessCode: accessCodeInput.trim() })
            })

            const verifyResult = await verifyResponse.json()

            if (!verifyResponse.ok || !verifyResult.valid) {
                setAccessCodeError('Invalid access code. Please try again.')
                setVerifyingAccessCode(false)
                return
            }

            // Access code verified! Close modal and proceed
            setShowAccessCodeModal(false)
            toast.success('Access code verified!')

            // IMPORTANT: This button click triggers fullscreen properly
            await proceedWithExamStart(pendingStudentName)

        } catch (error) {
            setAccessCodeError('Failed to verify access code. Please try again.')
        } finally {
            setVerifyingAccessCode(false)
        }
    }

    // ====== PROCEED WITH EXAM START (after access code verified) ======
    const proceedWithExamStart = async (examStudentName: string) => {
        try {
            // Check if already completed (case-insensitive name match)
            const { data: completedAttempt } = await supabase
                .from('student_attempts')
                .select('*')
                .eq('exam_id', params.id)
                .ilike('student_name', examStudentName.trim())
                .eq('completed', true)
                .maybeSingle()

            if (completedAttempt) {
                toast.error('You have already completed this exam')
                setScore(completedAttempt.score)
                setTimeSpent(completedAttempt.time_spent_seconds || 0)
                localStorage.setItem(`exam_${params.id}_student_name`, examStudentName.trim())
                setStudentName(examStudentName)
                setPhase('result')
                return
            }

            // Check for incomplete attempt (case-insensitive name match)
            const { data: incompleteAttempt } = await supabase
                .from('student_attempts')
                .select('*')
                .eq('exam_id', params.id)
                .ilike('student_name', examStudentName.trim())
                .eq('completed', false)
                .maybeSingle()

            if (incompleteAttempt) {
                // Calculate remaining time
                let remaining: number
                const lastActivity = incompleteAttempt.last_activity || incompleteAttempt.created_at
                const timeSinceLastActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 1000)

                if (incompleteAttempt.time_remaining_seconds != null) {
                    // SAFETY CHECK FIRST
                    if (timeSinceLastActivity > exam!.duration_minutes * 60) {
                        remaining = incompleteAttempt.time_remaining_seconds
                    } else {
                        // Subtract time that passed since last activity
                        remaining = Math.max(0, incompleteAttempt.time_remaining_seconds - timeSinceLastActivity)
                    }
                } else {
                    const elapsedTime = Math.floor((Date.now() - new Date(incompleteAttempt.created_at).getTime()) / 1000)
                    remaining = Math.max(0, (exam!.duration_minutes * 60) - elapsedTime)
                }

                if (remaining <= 0) {
                    toast.error('Your previous exam time has expired')
                    await autoSubmitExpiredAttempt(incompleteAttempt.id, exam!, questions)
                    return
                }

                // Show resume screen
                localStorage.setItem(`exam_${params.id}_student_name`, examStudentName.trim())
                setStudentName(examStudentName)

                // Pass the correctly calculated remaining time to resume screen
                const correctRemainingTime = Math.max(1, remaining)
                setResumeAttempt({
                    ...incompleteAttempt,
                    remainingTime: correctRemainingTime,
                    calculatedAt: Date.now()
                })

                setPhase('resume')
                return
            }

            // Create new attempt
            localStorage.setItem(`exam_${params.id}_student_name`, examStudentName.trim())
            setStudentName(examStudentName)

            const { data: newAttemptData, error } = await supabase
                .from('student_attempts')
                .insert([{
                    exam_id: params.id,
                    student_name: examStudentName.trim(),
                    exit_count: 0,
                    time_remaining_seconds: exam!.duration_minutes * 60,
                    last_activity: new Date().toISOString(),
                    started_at: new Date().toISOString(),
                }])
                .select()

            if (error || !newAttemptData?.[0]) {
                throw new Error('Failed to create exam attempt')
            }

            setAttemptId(newAttemptData[0].id)
            setTimeLeft(exam!.duration_minutes * 60)
            setPhase('exam')
            enterFullScreen()

        } catch (error: any) {
            // console.error('Start exam error:', error)
            toast.error(`Failed to start exam: ${error.message}`)
        }
    }

    // ====== RESUME EXAM - FIXED ======
    const resumeExam = async () => {
        if (!resumeAttempt || !exam) return

        try {
            // FIX #2 (HIGH): Don't recalculate time - already calculated in startExam
            // Using the time directly without re-subtracting
            const remainingTime = Math.max(0, resumeAttempt.remainingTime)

            // Check if time has expired
            if (remainingTime <= 0) {
                toast.error('Exam time has expired')
                await autoSubmitExpiredAttempt(resumeAttempt.id, exam, questions)
                return
            }

            // Set attempt data
            setAttemptId(resumeAttempt.id)
            setExitCount(resumeAttempt.exit_count || 0)

            // Fetch previous answers
            const { data: savedAnswers } = await supabase
                .from('student_answers')
                .select('*')
                .eq('attempt_id', resumeAttempt.id)

            if (savedAnswers) {
                savedAnswers.forEach(ans => {
                    setAnswer(ans.question_id, ans.selected_option_id)
                })
            }

            // Update DB with current time before starting
            const finalRemainingTime = Math.max(1, remainingTime)
            await supabase
                .from('student_attempts')
                .update({
                    last_activity: new Date().toISOString(),
                    time_remaining_seconds: finalRemainingTime
                })
                .eq('id', resumeAttempt.id)

            // Reset timer warnings for fresh session
            setWarningShown5min(false)
            setWarningShown1min(false)

            // Set time and start exam
            setTimeLeft(finalRemainingTime)
            setPhase('exam')
            enterFullScreen()
            toast.success(`Exam resumed! Time remaining: ${formatTime(finalRemainingTime)}`)

        } catch (error) {
            // console.error('Error resuming:', error)
            toast.error('Failed to resume exam')
        }
    }

    // ====== SUBMIT EXAM ======
    const submitExamConfirmed = useCallback(async () => {
        if (isSubmitting) return

        setIsSubmitting(true)
        setSyncing(true)

        try {
            if (!attemptId || !exam) throw new Error('Missing data')

            // SECURITY FIX: Call server API for validation and scoring
            const response = await fetch(`/api/exam/${exam.id}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    attemptId,
                    answers  // Just send selections, server determines correctness
                })
            })

            if (!response.ok) {
                const error = await response.json()

                // Special handling for time exceeded after network outage
                if (response.status === 403 && error.timeExceeded) {
                    // Time exceeded but within grace period - show result screen
                    // console.log('[Submit] Time exceeded - showing result screen')
                    toast('Exam submitted after time limit. Results may be affected.', {
                        icon: '⚠️',
                        duration: 5000
                    })

                    // Still try to show results if available
                    if (error.score !== undefined) {
                        setScore(error.score)
                        setTimeSpent(error.timeSpent || 0)
                    }
                    setPhase('result')
                    reset()
                    return
                }

                throw new Error(error.error || 'Submission failed')
            }

            const { score: finalScore, timeSpent: finalTimeSpent } = await response.json()

            setScore(finalScore)
            setTimeSpent(finalTimeSpent)
            setPhase('result')

            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => { })
            }

            reset()
            toast.success('Exam submitted successfully!')

        } catch (error: any) {
            // console.error('[Submit] Error:', error)

            // Improved error handling with retry logic
            const isNetworkError = !navigator.onLine || error.message?.includes('fetch')

            if (isNetworkError && submitRetryCount < 3) {
                // Network error - schedule retry with exponential backoff
                const retryDelay = Math.min(5000 * Math.pow(2, submitRetryCount), 30000) // Max 30s
                setSubmitRetryCount(prev => prev + 1)

                toast.error(`Submission failed. Retrying in ${Math.ceil(retryDelay / 1000)}s...`, {
                    duration: retryDelay
                })

                // Clear any existing timeout
                if (submitTimeoutRef.current) {
                    clearTimeout(submitTimeoutRef.current)
                }

                // Schedule retry
                submitTimeoutRef.current = setTimeout(() => {
                    if (phase === 'exam' && !isSubmitting) {
                        // console.log(`[Submit] Retry attempt ${submitRetryCount + 1}/3`)
                        submitExamConfirmed()
                    }
                }, retryDelay)
            } else {
                // Non-network error or max retries reached
                toast.error(error.message || 'Failed to submit exam. Please try again manually.', {
                    duration: 8000
                })
                setHasAttemptedSubmit(false) // Allow manual retry
            }
        } finally {
            setSyncing(false)
            setIsSubmitting(false)
            setShowSubmitModal(false)
        }
    }, [isSubmitting, attemptId, exam, answers, reset, submitRetryCount, phase])

    submitExamRef.current = submitExamConfirmed

    const submitExam = useCallback((autoSubmit = false) => {
        if (isSubmitting || !isOnline) return

        if (!autoSubmit) {
            setShowSubmitModal(true)
        } else {
            submitExamConfirmed()
        }
    }, [isSubmitting, isOnline, submitExamConfirmed])

    // ====== ANSWER QUESTION ======
    const handleAnswer = async (optionId: string) => {
        if (!attemptId) return

        const currentQuestion = questions[currentQuestionIndex]
        setAnswer(currentQuestion.id, optionId)

        // SECURITY FIX: Just save selection locally, no is_correct field
        // Server will validate on submission
        if (isOnline) {
            try {
                await supabase
                    .from('student_answers')
                    .upsert({
                        attempt_id: attemptId,
                        question_id: currentQuestion.id,
                        selected_option_id: optionId
                        // ✅ NO is_correct field - server calculates this
                    }, { onConflict: 'attempt_id,question_id' })
            } catch (error) {
                // console.error('Failed to save answer:', error)
                toast.error('Failed to save answer. Will retry on submit.')
            }
        }
    }

    const goToQuestion = (index: number) => {
        if (index >= 0 && index < questions.length) {
            setCurrentQuestionIndex(index)
        }
    }

    // ====== FULLSCREEN HANDLING ======
    const clearWarningTimers = useCallback(() => {
        if (warningTimeoutRef.current) {
            clearTimeout(warningTimeoutRef.current)
            warningTimeoutRef.current = null
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
        }
    }, [])

    const handleFullscreenChange = useCallback(() => {
        const isNowFullScreen = !!document.fullscreenElement

        if (!isNowFullScreen && phase === 'exam' && !exitWarningActiveRef.current) {
            clearWarningTimers()
            incrementExitCount()
            const currentExitCount = useExamStore.getState().exitCount
            const maxExits = exam?.max_exits || 3

            // Update DB
            if (attemptId) {
                supabase.from('student_attempts').update({
                    exit_count: currentExitCount,
                    last_activity: new Date().toISOString(),
                    time_remaining_seconds: timeLeft
                }).eq('id', attemptId).then(() => {
                    // console.log('Exit count updated:', currentExitCount)
                })
            }

            if (currentExitCount >= maxExits) {
                toast.error(`Maximum exits reached (${maxExits})! Auto-submitting exam...`)
                submitExamConfirmed()
                return
            }

            exitWarningActiveRef.current = true
            setExitWarningActive(true)

            // Use ref value for correct countdown duration
            const initialCountdown = warningCountdownRef.current
            setWarningCountdown(initialCountdown)

            toast.error(`Exit ${currentExitCount}/${maxExits} detected! Return to fullscreen!`)

            let countdown = initialCountdown
            const interval = setInterval(() => {
                countdown--
                setWarningCountdown(countdown)
                if (countdown <= 0) clearInterval(interval)
            }, 1000)
            countdownIntervalRef.current = interval

            const timeout = setTimeout(() => {
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current)
                    countdownIntervalRef.current = null
                }
                toast.error('Time expired! Auto-submitting exam...')
                exitWarningActiveRef.current = false
                setExitWarningActive(false)
                submitExamConfirmed()
            }, initialCountdown * 1000) // Use configured duration
            warningTimeoutRef.current = timeout

        } else if (isNowFullScreen && exitWarningActiveRef.current) {
            clearWarningTimers()
            exitWarningActiveRef.current = false
            setExitWarningActive(false)
            toast.success('Back in fullscreen mode')
        }
    }, [phase, exam, attemptId, timeLeft, clearWarningTimers, incrementExitCount, submitExamConfirmed])

    // ====== EFFECTS ======

    // Fetch exam on mount
    useEffect(() => {
        fetchExam()
    }, [])

    // AUTO-RECOVERY: Detect localStorage loss and recover from database
    useEffect(() => {
        const attemptAutoRecovery = async () => {
            // Only attempt recovery if:
            // 1. We have exam data
            // 2. We're in 'start' phase
            // 3. We don't have attemptId in store (localStorage was cleared)
            // 4. We have a saved student name
            if (!exam || phase !== 'start' || attemptId) return

            const savedName = localStorage.getItem(`exam_${params.id}_student_name`)
            if (!savedName) return

            try {
                // console.log('[Auto-Recovery] Attempting to recover exam state...')

                // Call Recovery API
                const response = await fetch(`/api/exam/${params.id}/recover`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentName: savedName })
                })

                const result = await response.json()

                if (result.success && result.found && result.data) {
                    // console.log('[Auto-Recovery] State recovered successfully!')

                    // Restore all state from recovery data
                    setAttemptId(result.data.attemptId)
                    setExitCount(result.data.exitCount)
                    setStudentName(savedName)
                    setTimeLeft(result.data.timeRemaining)

                    // Restore answers to store
                    Object.entries(result.data.answers).forEach(([qId, optId]) => {
                        setAnswer(qId, optId as string)
                    })

                    toast.success(`🔄 Session recovered! Time remaining: ${formatTime(result.data.timeRemaining)}`)

                    // Show resume screen
                    setResumeAttempt({
                        id: result.data.attemptId,
                        exit_count: result.data.exitCount,
                        remainingTime: result.data.timeRemaining,
                        calculatedAt: Date.now(),
                        started_at: result.data.startedAt,
                        last_activity: result.data.lastActivity
                    } as any)
                    setPhase('resume')

                } else if (result.expired) {
                    // console.log('[Auto-Recovery] Exam has expired')
                    toast.error('Your exam has expired')
                    if (result.found) {
                        setStudentName(savedName)
                        setPhase('result')
                    }
                } else {
                    // console.log('[Auto-Recovery] No incomplete attempt found')
                }
            } catch (error) {
                // console.error('[Auto-Recovery] Failed:', error)
                toast.error('Failed to recover exam session')
            }
        }

        attemptAutoRecovery()
    }, [exam, phase, attemptId, params.id, setAttemptId, setAnswer, setExitCount])

    // Check for saved attempt
    useEffect(() => {
        const checkSavedAttempt = async () => {
            if (!exam || phase !== 'start') return

            const savedName = localStorage.getItem(`exam_${params.id}_student_name`)
            if (!savedName || studentName) return

            try {
                // Check completed
                const { data: completedAttempt } = await supabase
                    .from('student_attempts')
                    .select('*')
                    .eq('exam_id', params.id)
                    .ilike('student_name', savedName)
                    .eq('completed', true)
                    .maybeSingle()

                if (completedAttempt) {
                    setStudentName(savedName)
                    setScore(completedAttempt.score)
                    setTimeSpent(completedAttempt.time_spent_seconds || 0)
                    setPhase('result')
                    return
                }

                // Check incomplete
                const { data: incompleteAttempts } = await supabase
                    .from('student_attempts')
                    .select('*')
                    .eq('exam_id', params.id)
                    .ilike('student_name', savedName)
                    .eq('completed', false)
                    .maybeSingle()

                const incompleteAttempt = incompleteAttempts
                if (!incompleteAttempt) return

                // Calculate remaining time
                let remaining: number
                const lastActivity = incompleteAttempt.last_activity || incompleteAttempt.created_at
                const timeSinceLastActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 1000)

                if (incompleteAttempt.time_remaining_seconds != null) {
                    // SAFETY CHECK FIRST: If timeSinceLastActivity is crazy large (means last_activity is wrong)
                    // Just use the stored time_remaining_seconds directly
                    if (timeSinceLastActivity > exam.duration_minutes * 60) {
                        remaining = incompleteAttempt.time_remaining_seconds
                    } else {
                        // Subtract time that passed since last activity (NORMAL CASE)
                        remaining = Math.max(0, incompleteAttempt.time_remaining_seconds - timeSinceLastActivity)
                    }
                } else {
                    // Calculate from created_at as fallback
                    const elapsed = Math.floor((Date.now() - new Date(incompleteAttempt.created_at).getTime()) / 1000)
                    remaining = Math.max(0, (exam.duration_minutes * 60) - elapsed)
                }

                if (remaining <= 0) {
                    toast.error('Exam time expired')
                    const qs = questions.length > 0 ? questions : (await supabase
                        .from('questions')
                        .select(`*, options (*)`)
                        .eq('exam_id', params.id)
                        .order('question_order')).data as ExamQuestion[] || []
                    await autoSubmitExpiredAttempt(incompleteAttempt.id, exam, qs)
                    return
                }

                setStudentName(savedName)
                setResumeAttempt({
                    ...incompleteAttempt,
                    remainingTime: Math.max(1, remaining),
                    calculatedAt: Date.now()
                })
                setPhase('resume')

            } catch (error) {
                // console.error('Error checking attempt:', error)
            }
        }

        checkSavedAttempt()
    }, [exam, phase, studentName])

    // Load/Save flagged questions
    useEffect(() => {
        if (!attemptId) return
        const savedFlags = localStorage.getItem(`exam_${attemptId}_flags`)
        if (savedFlags) {
            try {
                setFlaggedQuestions(JSON.parse(savedFlags))
            } catch (e) {
                // console.error('Error parsing flags', e)
            }
        }
    }, [attemptId])

    useEffect(() => {
        if (!attemptId) return
        localStorage.setItem(`exam_${attemptId}_flags`, JSON.stringify(flaggedQuestions))
    }, [flaggedQuestions, attemptId])

    // Timer - Main timer effect
    useEffect(() => {
        // Only run timer when in exam phase and not in exit warning
        if (phase !== 'exam' || exitWarningActive) {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current)
                timerIntervalRef.current = null
            }
            return
        }

        // Don't start if timeLeft is 0
        if (timeLeft <= 0) return

        // FIX #3: Keep ref in sync with current timer value
        timeLeftRef.current = timeLeft

        // Clear any existing interval
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
        }

        // Start new interval
        timerIntervalRef.current = setInterval(() => {
            // Calculate grace period (do this every second for real-time updates)
            const graceLimit = (exam?.offline_grace_minutes || 10) * 60
            const graceUsed = totalOfflineSeconds + currentOfflineDuration
            const graceRemaining = Math.max(0, graceLimit - graceUsed)

            // Update offline duration if offline
            if (!isOnline && graceRemaining > 0) {
                setCurrentOfflineDuration(d => d + 1)
            }

            setTimeLeft(prev => {
                const newTime = prev - 1

                // ⏸️ Pause main timer if offline with grace remaining
                if (!isOnline && graceRemaining > 0) {
                    return prev // Don't decrement - paused!
                }

                // ⏰ Otherwise count down normally
                if (newTime <= 0) {
                    if (timerIntervalRef.current) {
                        clearInterval(timerIntervalRef.current)
                        timerIntervalRef.current = null
                    }
                    return 0
                }
                return newTime
            })
        }, 1000)

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current)
                timerIntervalRef.current = null
            }
        }
    }, [phase, exitWarningActive, timeLeft, isOnline, totalOfflineSeconds, currentOfflineDuration, exam])

    // Time expiration - with proper offline handling  
    useEffect(() => {
        if (phase === 'exam' && timeLeft === 0 && !hasAttemptedSubmit) {
            setHasAttemptedSubmit(true) // Mark that we've tried to submit

            if (!isOnline) {
                // Show offline message immediately
                toast.error('Time is up! Please connect to the internet to submit your exam.', {
                    duration: 10000 // Show for 10 seconds
                })
                // Don't attempt to submit - wait for online
                return
            }

            if (!isSubmitting && submitExamRef.current) {
                toast.error('Time is up! Auto-submitting exam...')
                submitExamRef.current()
            }
        }
    }, [phase, timeLeft, hasAttemptedSubmit, isSubmitting, isOnline])

    // Update last activity and time periodically
    useEffect(() => {
        if (phase !== 'exam' || !attemptId) return

        const interval = setInterval(() => {
            const now = Date.now()
            // Only sync every 10 seconds minimum
            if (now - lastSyncTimeRef.current >= 10000) {
                lastSyncTimeRef.current = now
                // FIX #3 (MEDIUM): Use ref to get current timeLeft value
                const currentTime = timeLeftRef.current
                supabase.from('student_attempts').update({
                    last_activity: new Date().toISOString(),
                    time_remaining_seconds: currentTime
                }).eq('id', attemptId).then(({ error }) => {
                    if (error) {
                        // console.error('Failed to sync activity:', error)
                    }
                })
            }
        }, 10000)

        return () => clearInterval(interval)
    }, [phase, attemptId])

    // Fullscreen listener
    useEffect(() => {
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            clearWarningTimers()
        }
    }, [handleFullscreenChange, clearWarningTimers])

    // Prevent actions during exam
    useEffect(() => {
        if (phase !== 'exam') return

        const prevent = (e: Event) => {
            e.preventDefault()
            return false
        }

        document.addEventListener('contextmenu', prevent)
        document.addEventListener('copy', prevent)
        document.addEventListener('cut', prevent)
        document.addEventListener('paste', prevent)

        return () => {
            document.removeEventListener('contextmenu', prevent)
            document.removeEventListener('copy', prevent)
            document.removeEventListener('cut', prevent)
            document.removeEventListener('paste', prevent)
        }
    }, [phase])

    // Cleanup submit timeout on unmount
    useEffect(() => {
        return () => {
            if (submitTimeoutRef.current) {
                clearTimeout(submitTimeoutRef.current)
                submitTimeoutRef.current = null
            }
        }
    }, [])

    // Prevent page close/refresh
    useEffect(() => {
        if (phase !== 'exam') return

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = 'Are you sure you want to leave? Your exam progress will be lost.'

            // Save current state before leaving
            if (attemptId) {
                supabase.from('student_attempts').update({
                    last_activity: new Date().toISOString(),
                    time_remaining_seconds: timeLeftRef.current // Use ref instead of state!
                }).eq('id', attemptId)
            }
            return 'Are you sure you want to leave? Your exam progress will be lost.'
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [phase, attemptId]) // Removed timeLeft from dependencies

    // Network status - with auto-submit on reconnection
    useEffect(() => {
        const handleOnline = async () => {
            setIsOnline(true)

            // Call offline API to calculate duration server-side
            if (attemptId && phase === 'exam') {
                try {
                    const res = await fetch(`/api/exam/${params.id}/offline`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ attemptId })
                    })

                    const data = await res.json()
                    if (data.success) {
                        setTotalOfflineSeconds(data.totalOffline || 0)
                        setCurrentOfflineDuration(0) // Reset current duration
                        // console.log(`[Offline] Reconnected. Added ${data.offlineAdded}s, total: ${data.totalOffline}s`)
                    }
                } catch (error) {
                    // console.error('[Offline] Error calling reconnect API:', error)
                }
            }

            // If time expired while offline, submit now
            if (phase === 'exam' && timeLeft === 0 && hasAttemptedSubmit && !isSubmitting && submitExamRef.current) {
                // console.log('[Auto-Submit] Back online after time expired - submitting now')
                toast('Back online! Submitting exam...', {
                    icon: 'ℹ️',
                    duration: 3000
                })
                setSubmitRetryCount(0) // Reset retry count
                submitExamRef.current()
            }
        }

        const handleOffline = async () => {
            setIsOnline(false)

            // Call offline API to mark as offline (server sets timestamp)
            if (attemptId && phase === 'exam') {
                try {
                    await fetch(`/api/exam/${params.id}/offline`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ attemptId })
                    })
                    // console.log('[Offline] Marked as offline in database')
                } catch (error) {
                    // console.error('[Offline] Error calling offline API:', error)
                }
            }

            if (phase === 'exam') {
                toast('You are offline. Your answers are saved locally.', {
                    icon: '⚠️',
                    duration: 5000
                })
            }
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        setIsOnline(navigator.onLine)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [phase, timeLeft, hasAttemptedSubmit, isSubmitting, attemptId]) // Added dependencies to fix closure issue

    // Load offline state from database on exam start/resume
    useEffect(() => {
        const loadOfflineState = async () => {
            if (!attemptId || phase !== 'exam') return

            try {
                const { data } = await supabase
                    .from('student_attempts')
                    .select('total_offline_seconds, went_offline_at')
                    .eq('id', attemptId)
                    .single()

                if (data) {
                    setTotalOfflineSeconds(data.total_offline_seconds || 0)

                    // 🔒 Safety: If was offline before refresh, calculate current duration
                    if (data.went_offline_at && !navigator.onLine) {
                        const elapsed = Math.floor(
                            (Date.now() - new Date(data.went_offline_at).getTime()) / 1000
                        )
                        setCurrentOfflineDuration(elapsed)
                        // console.log('[Offline] Restored offline state after refresh:', {
                        //     total: data.total_offline_seconds,
                        //     current: elapsed
                        // })
                    }
                }
            } catch (error) {
                // console.error('[Offline] Error loading offline state:', error)
            }
        }

        loadOfflineState()
    }, [attemptId, phase])

    // Prevent tab switching / window blur during exam
    useEffect(() => {
        if (phase !== 'exam') return

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // console.warn('Tab switched during exam')
                // You could add additional logic here if needed
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [phase])


    // Prevent select start// Detect and warn about Alt+Tab / Window switching
    useEffect(() => {
        if (phase !== 'exam') return

        const handleBlur = () => {
            if (phase === 'exam') {
                blurCountRef.current++ // Use ref to persist across re-renders
                // console.warn(`Window blur detected (count: ${blurCountRef.current})`)

                // Update DB with blur/switch count
                if (attemptId) {
                    supabase.from('student_attempts').update({
                        window_switches: blurCountRef.current,
                        last_activity: new Date().toISOString()
                    }).eq('id', attemptId).then(({ data, error }) => {
                        if (error) {
                            // console.error('Failed to update window_switches:', error)
                        } else {
                            // console.log('✅ Window switches updated successfully:', blurCountRef.current)
                        }
                    })
                }

                toast.error(`⚠️ Focus lost detected! Keep focus on exam window.`, {
                    duration: 3000,
                })
            }
        }

        window.addEventListener('blur', handleBlur)
        return () => window.removeEventListener('blur', handleBlur)
    }, [phase, attemptId])
    // ====== RENDER ======

    // Inactive Exam State
    if (isExamInactive) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md p-8 text-center">
                    <div className="w-16 h-16 bg-yellow-50 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <Clock className="w-8 h-8 text-yellow-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Exam Not Active</h1>
                    <p className="text-gray-600 text-sm mb-6">
                        This exam is currently not active. Please check with your instructor.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium"
                    >
                        Check Again
                    </button>
                </div>
            </div>
        )
    }

    // Loading
    if (!exam && !examError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <div className="text-sm text-gray-600">Loading exam...</div>
                </div>
            </div>
        )
    }

    // Error
    if (examError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border border-gray-200 w-full max-w-md p-8 text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full mx-auto mb-4 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load Exam</h1>
                    <p className="text-gray-600 text-sm mb-6">{examError}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full px-6 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        )
    }

    // Resume
    if (phase === 'resume' && resumeAttempt && exam) {
        const examData = exam!
        //const minsRemaining = Math.floor(resumeAttempt.remainingTime / 60)
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border border-gray-200 w-full max-w-lg p-8">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-green-50 rounded-full mx-auto mb-3 flex items-center justify-center">
                            <PlayCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome Back!</h1>
                        <p className="text-gray-600 text-sm">Continue your exam</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Exam</span>
                            <span className="text-gray-900 font-medium">{examData.title}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Student</span>
                            <span className="text-gray-900 font-medium">{studentName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Time Remaining</span>
                            <span className="text-gray-900 font-bold">{formatTime(resumeAttempt.remainingTime)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Progress</span>
                            <span className="text-gray-900 font-medium">{Object.keys(answers).length} / {questions.length}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Exits Used</span>
                            <span className="text-gray-900 font-medium">{resumeAttempt.exit_count || 0} / {examData.max_exits}</span>
                        </div>
                        {resumeAttempt.total_offline_seconds > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Offline Grace Used</span>
                                <span className="text-gray-900 font-medium">
                                    {Math.floor(resumeAttempt.total_offline_seconds / 60)}m {resumeAttempt.total_offline_seconds % 60}s / {examData.offline_grace_minutes}m
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
                        <p className="text-xs text-yellow-800">
                            <strong>Note:</strong> Your answers are saved. The timer continues from where it stopped.
                        </p>
                    </div>

                    <button
                        onClick={resumeExam}
                        disabled={!isOnline}
                        className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <PlayCircle className="w-5 h-5" />
                        Continue Exam
                    </button>

                    {!isOnline && (
                        <p className="text-center text-red-600 text-xs mt-3 flex items-center justify-center gap-1">
                            <WifiOff className="w-3 h-3" />
                            Waiting for internet connection...
                        </p>
                    )}
                </div>
            </div>
        )
    }

    // Start screen
    if (phase === 'start') {
        const examData = exam!
        const savedName = localStorage.getItem(`exam_${params.id}_student_name`)
        const isReturningStudent = savedName && !studentName

        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border border-gray-200 w-full max-w-2xl p-8">
                    {isReturningStudent ? (
                        <div>
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome Back, {savedName}!</h1>
                                <p className="text-gray-600 text-sm">Ready to start your exam?</p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Exam</span>
                                    <span className="text-gray-900 font-medium">{examData.title}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Duration</span>
                                    <span className="text-gray-900 font-medium">{examData.duration_minutes} min</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Questions</span>
                                    <span className="text-gray-900 font-medium">{questions.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Pass Score</span>
                                    <span className="text-gray-900 font-medium">{examData.pass_score}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Max Exits</span>
                                    <span className="text-gray-900 font-medium">{examData.max_exits}</span>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
                                <p className="text-xs text-yellow-800">
                                    <strong>Rules:</strong> Fullscreen required • {examData.exit_warning_seconds || 10}s to return if you exit • Disconnections allowed within {examData.offline_grace_minutes || 10}min
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setStudentName('')
                                        localStorage.removeItem(`exam_${params.id}_student_name`)
                                        setResumeAttempt(null)
                                        setPhase('start')
                                    }}
                                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
                                >
                                    Not you?
                                </button>
                                <button
                                    onClick={() => startExam(savedName || undefined)}
                                    disabled={!isOnline}
                                    className="flex-1 bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <PlayCircle className="w-5 h-5" />
                                    {!isOnline ? 'Waiting for connection...' : 'Start Exam'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="mb-6">
                                <h1 className="text-2xl font-bold text-gray-900 mb-1">{examData.title}</h1>
                                {examData.description && (
                                    <p className="text-gray-600 text-sm">{examData.description}</p>
                                )}
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Duration</span>
                                    <span className="text-gray-900 font-medium">{examData.duration_minutes} min</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Questions</span>
                                    <span className="text-gray-900 font-medium">{questions.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Total Points</span>
                                    <span className="text-gray-900 font-medium">{totalPoints}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Pass Score</span>
                                    <span className="text-gray-900 font-medium">{examData.pass_score}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Max Exits</span>
                                    <span className="text-gray-900 font-medium">{examData.max_exits}</span>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
                                <p className="text-xs text-yellow-800">
                                    <strong>Rules:</strong> Fullscreen required • {examData.exit_warning_seconds}s to return if you exit • Max {examData.max_exits} exits • Can resume within {examData.offline_grace_minutes}min if disconnected • No refresh/close
                                </p>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Your Full Name *
                                </label>
                                <input
                                    type="text"
                                    value={studentName}
                                    onChange={(e) => setStudentName(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && studentName.trim() && isOnline) {
                                            startExam()
                                        }
                                    }}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                                    placeholder="Enter your full name"
                                    disabled={!isOnline}
                                    autoComplete="name"
                                />
                            </div>

                            <button
                                onClick={() => startExam()}
                                disabled={!isOnline || !studentName.trim()}
                                className="w-full bg-gray-900 text-white py-2.5 rounded-lg font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {!isOnline ? 'Waiting for connection...' : 'Start Exam'}
                            </button>

                            {!isOnline && (
                                <p className="text-center text-red-600 text-xs mt-3 flex items-center justify-center gap-1">
                                    <WifiOff className="w-3 h-3" />
                                    No internet connection
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Access Code Modal - INSIDE start phase */}
                {showAccessCodeModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !verifyingAccessCode && setShowAccessCodeModal(false)} />
                        <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
                            <div className="text-center">
                                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <ClipboardList className="w-12 h-12 text-blue-600" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Code Required</h2>
                                <p className="text-gray-600 mb-6">
                                    This exam requires an access code to start.
                                </p>

                                <div className="mb-4">
                                    <input
                                        type="text"
                                        value={accessCodeInput}
                                        onChange={(e) => {
                                            setAccessCodeInput(e.target.value)
                                            setAccessCodeError('')
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAccessCodeSubmit()}
                                        placeholder="Enter access code"
                                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-lg font-semibold tracking-wider focus:outline-none focus:border-blue-500"
                                        autoFocus
                                        disabled={verifyingAccessCode}
                                    />
                                    {accessCodeError && (
                                        <p className="text-red-600 text-sm mt-2">{accessCodeError}</p>
                                    )}
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setShowAccessCodeModal(false)}
                                        disabled={verifyingAccessCode}
                                        className="flex-1 py-3 px-6 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAccessCodeSubmit}
                                        disabled={verifyingAccessCode || !accessCodeInput.trim()}
                                        className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {verifyingAccessCode ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Verifying...
                                            </>
                                        ) : 'Start Exam'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Result screen
    if (phase === 'result') {
        const examData = exam!
        const passed = score !== null && score >= examData.pass_score

        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8 text-center">
                    <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${examData.show_results
                        ? (passed ? 'bg-green-100' : 'bg-red-100')
                        : 'bg-blue-100'
                        }`}>
                        {examData.show_results ? (
                            passed ? (
                                <CheckCircle className="w-16 h-16 text-green-600" />
                            ) : (
                                <XCircle className="w-16 h-16 text-red-600" />
                            )
                        ) : (
                            <CheckCircle className="w-16 h-16 text-blue-600" />
                        )}
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {examData.show_results
                            ? (passed ? '🎉 Congratulations!' : 'Exam Completed')
                            : 'Exam Submitted Successfully'
                        }
                    </h1>

                    <p className="text-gray-600 mb-8">
                        {examData.show_results
                            ? (passed ? 'You have passed the exam!' : 'You did not reach the passing score.')
                            : 'Your exam has been submitted successfully. Results will be reviewed by the instructor.'
                        }
                    </p>

                    {examData.show_results && score !== null && (
                        <div className={`rounded-xl p-6 mb-6 ${passed ? 'bg-green-50' : 'bg-gray-50'}`}>
                            <div className="text-5xl font-bold text-gray-900 mb-2">
                                {score.toFixed(1)}%
                            </div>
                            <div className="text-gray-600 mb-2">
                                Pass score: {examData.pass_score}%
                            </div>
                            <div className={`text-sm font-semibold ${passed ? 'text-green-600' : 'text-gray-500'}`}>
                                {passed ? '✓ Passed' : '✗ Not Passed'}
                            </div>
                        </div>
                    )}

                    {!examData.show_results && (
                        <div className="bg-blue-50 rounded-xl p-6 mb-6">
                            <p className="text-blue-800">
                                Your results will be reviewed by the instructor.
                                <br />
                                You will be notified of your score soon.
                            </p>
                        </div>
                    )}

                    {examData.show_results && (
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="text-sm text-gray-600">Questions</div>
                                <div className="text-2xl font-bold text-gray-900">{questions.length}</div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="text-sm text-gray-600">Time Spent</div>
                                <div className="text-2xl font-bold text-gray-900">
                                    {Math.floor(timeSpent / 60)}:{(timeSpent % 60).toString().padStart(2, '0')}
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="text-sm text-gray-600">Answered</div>
                                <div className="text-2xl font-bold text-gray-900">{Object.keys(answers).length}</div>
                            </div>
                        </div>
                    )}

                    <div className="text-sm text-gray-500">
                        Student: {studentName}
                    </div>
                </div>
            </div>
        )
    }

    // Exam screen
    const examData = exam!
    const currentQuestion = questions[currentQuestionIndex]
    const answeredCount = Object.keys(answers).length
    const unansweredCount = questions.length - answeredCount

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Offline Grace Period Modal */}
            {!isOnline && exam && (() => {
                const graceLimit = (exam.offline_grace_minutes || 10) * 60
                const graceUsed = totalOfflineSeconds + currentOfflineDuration
                const graceRemaining = Math.max(0, graceLimit - graceUsed)
                const gracePercent = (graceRemaining / graceLimit) * 100

                return (
                    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
                            <div className="text-center">
                                {graceRemaining > 0 ? (
                                    <>
                                        <div className="mb-4">
                                            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
                                                <span className="text-3xl">⏸️</span>
                                            </div>
                                        </div>

                                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                            Connection Lost
                                        </h3>

                                        <p className="text-gray-600 mb-6">
                                            Main exam timer is <span className="font-semibold text-orange-600">paused</span>
                                        </p>

                                        {/* Grace Remaining Time */}
                                        <div className="mb-4">
                                            <div className="text-sm text-gray-500 mb-2">Grace time remaining:</div>
                                            <div className="text-4xl font-bold text-orange-600">
                                                {formatTime(graceRemaining)}
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="w-full bg-gray-200 rounded-full h-4 mb-6 overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-orange-500 to-orange-600 h-4 rounded-full transition-all duration-1000 ease-linear"
                                                style={{ width: `${gracePercent}%` }}
                                            />
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                                            <ul className="text-left space-y-2">
                                                <li className="flex items-start">
                                                    <span className="mr-2">✓</span>
                                                    <span>Your answers are saved</span>
                                                </li>
                                                <li className="flex items-start">
                                                    <span className="mr-2">✓</span>
                                                    <span>Exam will resume when connection restored</span>
                                                </li>
                                                <li className="flex items-start">
                                                    <span className="mr-2">⏱️</span>
                                                    <span>Main timer paused: <strong>{formatTime(timeLeft)}</strong></span>
                                                </li>
                                            </ul>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="mb-4">
                                            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                                                <span className="text-3xl">⏰</span>
                                            </div>
                                        </div>

                                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                            Grace Period Exhausted
                                        </h3>

                                        <p className="text-gray-600 mb-4">
                                            You've been offline for too long
                                        </p>

                                        {/* Main Timer Running */}
                                        <div className="mb-4">
                                            <div className="text-sm text-red-600 mb-2">Main timer is now running:</div>
                                            <div className="text-4xl font-bold text-red-600">
                                                {formatTime(timeLeft)}
                                            </div>
                                        </div>

                                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
                                            <p className="font-semibold mb-2">Please reconnect to submit your exam</p>
                                            <p>Your answers are safe, but the exam timer is now counting down.</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Submit Modal */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSubmitting && setShowSubmitModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-12 h-12 text-gray-900" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Submit Exam?</h2>
                            <p className="text-gray-600 mb-4">
                                Are you sure you want to submit? You won't be able to change your answers.
                            </p>

                            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm">
                                <div className="flex justify-between mb-2">
                                    <span className="text-gray-600">Answered:</span>
                                    <span className="font-semibold text-gray-900">{answeredCount} / {questions.length}</span>
                                </div>
                                {unansweredCount > 0 && (
                                    <div className="flex justify-between text-red-600">
                                        <span>Unanswered:</span>
                                        <span className="font-semibold">{unansweredCount}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowSubmitModal(false)}
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-6 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={submitExamConfirmed}
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 px-6 bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Submitting...
                                        </>
                                    ) : 'Yes, Submit'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Exit Warning Modal */}
            {exitWarningActive && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-pulse">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <AlertTriangle className="w-12 h-12 text-red-600 animate-bounce" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">⚠️ Exit Detected!</h2>
                            <p className="text-gray-600 mb-6">
                                Return to fullscreen immediately or your exam will be auto-submitted!
                            </p>
                            <div className="mb-6">
                                <div className="text-6xl font-bold text-red-600 mb-2">{warningCountdown}</div>
                                <div className="text-sm text-gray-500">seconds remaining</div>
                            </div>
                            <button
                                onClick={() => {
                                    clearWarningTimers()
                                    exitWarningActiveRef.current = false
                                    setExitWarningActive(false)
                                    enterFullScreen()
                                }}
                                className="w-full py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition"
                            >
                                Return to Fullscreen Now
                            </button>
                            <p className="text-sm text-gray-500 mt-4">
                                Exits: {exitCount}/{exam?.max_exits || 3}
                                {exitCount >= (exam?.max_exits || 3) - 1 && (
                                    <span className="text-red-600 font-semibold ml-2">
                                        ⚠️ Last warning!
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{examData.title}</h1>
                            <p className="text-sm text-gray-500">{studentName}</p>
                        </div>
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${timeLeft < 300 ? 'bg-red-100 text-red-700 animate-pulse' : timeLeft < 600 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                            <Clock className="w-5 h-5" />
                            {formatTime(timeLeft)}
                        </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                        <div className="flex items-center gap-4">
                            <span className="font-medium">Question {currentQuestionIndex + 1}/{questions.length}</span>
                            <span>•</span>
                            <span className="text-green-600 font-medium">✓ {answeredCount}</span>
                            <span>•</span>
                            <span className="text-gray-400">○ {unansweredCount}</span>
                            <span>•</span>
                            <span>Exits: {exitCount}/{examData.max_exits}</span>
                        </div>
                        {/* Font Size Controls */}
                        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setFontSize('base')}
                                className={`p-1 rounded ${fontSize === 'base' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                title="Normal Text"
                            >
                                <span className="text-xs font-bold">A</span>
                            </button>
                            <button
                                onClick={() => setFontSize('lg')}
                                className={`p-1 rounded ${fontSize === 'lg' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                title="Large Text"
                            >
                                <span className="text-sm font-bold">A+</span>
                            </button>
                            <button
                                onClick={() => setFontSize('xl')}
                                className={`p-1 rounded ${fontSize === 'xl' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                title="Extra Large Text"
                            >
                                <span className="text-lg font-bold">A++</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
                    {/* Main Content */}
                    <div className="lg:col-span-9 space-y-6">
                        {/* Question */}
                        <div key={currentQuestion.id} className="bg-white rounded-xl shadow-lg p-8 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="mb-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="text-sm text-gray-500">
                                        Question {currentQuestionIndex + 1} of {questions.length}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setFlaggedQuestions(prev => ({ ...prev, [currentQuestion.id]: !prev[currentQuestion.id] }))}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${flaggedQuestions[currentQuestion.id] ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        >
                                            <Flag className={`w-4 h-4 ${flaggedQuestions[currentQuestion.id] ? 'fill-orange-700' : ''}`} />
                                            {flaggedQuestions[currentQuestion.id] ? 'Flagged' : 'Flag'}
                                        </button>
                                        <div className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">
                                            {currentQuestion.points} {currentQuestion.points === 1 ? 'pt' : 'pts'}
                                        </div>
                                    </div>
                                </div>
                                <h2 className={`font-semibold text-gray-900 leading-relaxed ${fontSize === 'xl' ? 'text-2xl' : fontSize === 'lg' ? 'text-xl' : 'text-lg'}`}>
                                    {currentQuestion.question_text}
                                </h2>
                            </div>

                            <div className="space-y-3">
                                {currentQuestion.options.map((option, idx) => {
                                    const isSelected = answers[currentQuestion.id] === option.id
                                    const optionLabel = String.fromCharCode(65 + idx) // A, B, C, D...

                                    return (
                                        <button
                                            key={option.id}
                                            onClick={() => handleAnswer(option.id)}
                                            className={`w-full text-left px-6 py-4 rounded-lg border-2 transition-all hover:shadow-md ${isSelected ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-200' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm transition-colors ${isSelected ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                                                    {isSelected ? <CheckCircle className="w-5 h-5" /> : optionLabel}
                                                </div>
                                                <span className={`text-gray-900 ${fontSize === 'xl' ? 'text-xl' : fontSize === 'lg' ? 'text-lg' : 'text-base'}`}>
                                                    {option.option_text}
                                                </span>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Navigation */}
                        <div className="flex justify-between items-center">
                            <button
                                onClick={() => goToQuestion(currentQuestionIndex - 1)}
                                disabled={currentQuestionIndex === 0}
                                className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 hover:shadow-sm transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                ← Previous
                            </button>

                            <div className="text-sm text-gray-500">
                                {!answers[currentQuestion.id] && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700 font-medium border border-yellow-200 shadow-sm animate-pulse">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        Not answered
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                {currentQuestionIndex === questions.length - 1 ? (
                                    <button
                                        onClick={() => submitExam(false)}
                                        disabled={isSubmitting || syncing || !isOnline}
                                        className="px-8 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 font-semibold disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {syncing ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Submitting...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-5 h-5" />
                                                Submit Exam
                                            </>
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => goToQuestion(currentQuestionIndex + 1)}
                                        className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 font-semibold flex items-center gap-2"
                                    >
                                        Next →
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Navigator */}
                    <div className="lg:col-span-3 sticky top-24">
                        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                            <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
                                <span>Question Navigator</span>
                                <span className="text-xs font-normal bg-gray-100 px-2 py-1 rounded text-gray-600">
                                    {answeredCount}/{questions.length} Done
                                </span>
                            </h3>

                            <div className="grid grid-cols-5 gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                                {questions.map((q, idx) => {
                                    const isAnswered = answers[q.id]
                                    const isCurrent = idx === currentQuestionIndex
                                    const isFlagged = flaggedQuestions[q.id]

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => goToQuestion(idx)}
                                            className={`
                                                relative aspect-square rounded-lg font-semibold transition-all duration-200 flex items-center justify-center text-sm
                                                ${isCurrent
                                                    ? 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-2 scale-105 shadow-md z-10'
                                                    : isAnswered
                                                        ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                                                }
                                                ${isFlagged ? 'ring-2 ring-orange-400 ring-offset-1' : ''}
                                            `}
                                        >
                                            {idx + 1}
                                            {isFlagged && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border border-white shadow-sm" />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                                    <span>Current</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                                    <span>Answered</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <div className="w-3 h-3 bg-gray-50 border border-gray-200 rounded"></div>
                                    <span>Not Answered</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <div className="w-3 h-3 bg-white border-2 border-orange-400 rounded"></div>
                                    <span>Flagged for Review</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}