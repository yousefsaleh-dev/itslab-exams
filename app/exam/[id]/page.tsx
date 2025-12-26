'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Exam, Question, Option } from '@/lib/supabase'
import { useExamStore } from '@/lib/store'
import { Clock, AlertTriangle, CheckCircle, XCircle, WifiOff, PlayCircle, FileText, Timer, ClipboardList, Target, Award, DoorOpen, Flag } from 'lucide-react'
import toast from 'react-hot-toast'

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
    const [score, setScore] = useState<number | null>(null)
    const [totalPoints, setTotalPoints] = useState(0)
    const [isOnline, setIsOnline] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [examError, setExamError] = useState<string | null>(null)
    const [isExamInactive, setIsExamInactive] = useState(false)
    const [showSubmitModal, setShowSubmitModal] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [timeSpent, setTimeSpent] = useState(0)
    const [resumeAttempt, setResumeAttempt] = useState<any>(null)
    const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({})
    const [fontSize, setFontSize] = useState<'base' | 'lg' | 'xl'>('base')

    const { attemptId, answers, exitCount, setAttemptId, setAnswer, incrementExitCount, reset, setExitCount } = useExamStore()

    // Refs
    const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const exitWarningActiveRef = useRef<boolean>(false)
    const submitExamRef = useRef<(() => Promise<void>) | null>(null)
    const lastSyncTimeRef = useRef<number>(0)

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
            const { data: examData, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', params.id)
                .single()

            if (examError || !examData) {
                setExamError('Exam not found. Please check the link and try again.')
                return
            }

            if (!examData.is_active) {
                setIsExamInactive(true)
                // setExamError('This exam is currently deactivated by the instructor.')
                return
            }

            setExam(examData)

            const { data: questionsData, error: questionsError } = await supabase
                .from('questions')
                .select(`*, options (*)`)
                .eq('exam_id', params.id)
                .order('question_order')

            if (questionsError) throw questionsError

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
            console.error('Error fetching exam:', error)
            setExamError('Failed to load exam. Please refresh the page and try again.')
        }
    }

    // ====== AUTO SUBMIT EXPIRED ATTEMPT ======
    const autoSubmitExpiredAttempt = async (attemptId: string, examData: Exam, questions: ExamQuestion[]) => {
        try {
            const { data: savedAnswers } = await supabase
                .from('student_answers')
                .select('*')
                .eq('attempt_id', attemptId)

            let earnedPoints = 0
            const totalPts = questions.reduce((sum, q) => sum + q.points, 0)

            if (savedAnswers) {
                savedAnswers.forEach(ans => {
                    const question = questions.find(q => q.id === ans.question_id)
                    if (question && ans.is_correct) {
                        earnedPoints += question.points
                    }
                })
            }

            const finalScore = totalPts > 0 ? (earnedPoints / totalPts) * 100 : 0

            await supabase
                .from('student_attempts')
                .update({
                    completed: true,
                    score: finalScore,
                    total_points: totalPts,
                    time_spent_seconds: examData.duration_minutes * 60,
                    completed_at: new Date().toISOString()
                })
                .eq('id', attemptId)

            setScore(finalScore)
            setTimeSpent(examData.duration_minutes * 60)
            setPhase('result')
        } catch (error) {
            console.error('Error auto-submitting:', error)
        }
    }

    // ====== START EXAM ======
    const startExam = async (nameOverride?: string) => {
        if (!isOnline) {
            toast.error('Cannot start exam while offline')
            return
        }

        const examStudentName = nameOverride || studentName
        if (!examStudentName.trim()) {
            toast.error('Please enter your name')
            return
        }

        if (!exam) return

        try {
            // Check if already completed
            const { data: completedAttempt } = await supabase
                .from('student_attempts')
                .select('*')
                .eq('exam_id', params.id)
                .eq('student_name', examStudentName.trim())
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

            // Check for incomplete attempt
            const { data: incompleteAttempt } = await supabase
                .from('student_attempts')
                .select('*')
                .eq('exam_id', params.id)
                .eq('student_name', examStudentName.trim())
                .eq('completed', false)
                .maybeSingle()

            if (incompleteAttempt) {
                // Calculate remaining time
                let remaining: number
                const lastActivity = incompleteAttempt.last_activity || incompleteAttempt.created_at
                const timeSinceLastActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 1000)

                if (incompleteAttempt.time_remaining_seconds != null) {
                    // SAFETY CHECK FIRST
                    if (timeSinceLastActivity > exam.duration_minutes * 60) {
                        remaining = incompleteAttempt.time_remaining_seconds
                    } else {
                        // Subtract time that passed since last activity
                        remaining = Math.max(0, incompleteAttempt.time_remaining_seconds - timeSinceLastActivity)
                    }
                } else {
                    const elapsedTime = Math.floor((Date.now() - new Date(incompleteAttempt.created_at).getTime()) / 1000)
                    remaining = Math.max(0, (exam.duration_minutes * 60) - elapsedTime)
                }

                if (remaining <= 0) {
                    toast.error('Your previous exam time has expired')
                    await autoSubmitExpiredAttempt(incompleteAttempt.id, exam, questions)
                    return
                }

                // Check inactivity (15 minutes)
                if (timeSinceLastActivity > 900) {
                    toast.error('Previous session expired due to inactivity')
                    await autoSubmitExpiredAttempt(incompleteAttempt.id, exam, questions)
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
                    time_remaining_seconds: exam.duration_minutes * 60,
                    last_activity: new Date().toISOString(),
                }])
                .select()

            if (error || !newAttemptData?.[0]) {
                throw new Error('Failed to create exam attempt')
            }

            setAttemptId(newAttemptData[0].id)
            setTimeLeft(exam.duration_minutes * 60)
            setPhase('exam')
            enterFullScreen()

        } catch (error: any) {
            console.error('Start exam error:', error)
            toast.error(`Failed to start exam: ${error.message}`)
        }
    }

    // ====== RESUME EXAM - FIXED ======
    const resumeExam = async () => {
        if (!resumeAttempt || !exam) return

        try {
            // Calculate time that passed since remainingTime was calculated
            const timeSinceCalculation = Math.floor((Date.now() - resumeAttempt.calculatedAt) / 1000)
            const remainingTime = Math.max(0, resumeAttempt.remainingTime - timeSinceCalculation)

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

            // Set time and start exam
            setTimeLeft(finalRemainingTime)
            setPhase('exam')
            enterFullScreen()
            toast.success(`Exam resumed! Time remaining: ${formatTime(finalRemainingTime)}`)

        } catch (error) {
            console.error('Error resuming:', error)
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

            let earnedPoints = 0
            const answersToUpsert = []

            for (const question of questions) {
                const selectedOptionId = answers[question.id]
                if (!selectedOptionId) continue

                const selectedOption = question.options.find(o => o.id === selectedOptionId)
                if (selectedOption?.is_correct) {
                    earnedPoints += question.points
                }

                answersToUpsert.push({
                    attempt_id: attemptId,
                    question_id: question.id,
                    selected_option_id: selectedOptionId,
                    is_correct: selectedOption?.is_correct || false
                })
            }

            if (answersToUpsert.length > 0) {
                await supabase.from('student_answers').delete().eq('attempt_id', attemptId)
                await supabase.from('student_answers').insert(answersToUpsert)
            }

            const finalScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
            const finalTimeSpent = (exam.duration_minutes * 60) - timeLeft

            await supabase
                .from('student_attempts')
                .update({
                    completed: true,
                    score: finalScore,
                    total_points: totalPoints,
                    time_spent_seconds: finalTimeSpent,
                    completed_at: new Date().toISOString()
                })
                .eq('id', attemptId)

            setScore(finalScore)
            setTimeSpent(finalTimeSpent)
            setPhase('result')

            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => { })
            }

            reset()
            toast.success('Exam submitted successfully!')

        } catch (error) {
            console.error('Submit error:', error)
            toast.error('Failed to submit exam. Please try again.')
        } finally {
            setSyncing(false)
            setIsSubmitting(false)
            setShowSubmitModal(false)
        }
    }, [isSubmitting, attemptId, exam, questions, answers, totalPoints, timeLeft, reset])

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

        if (isOnline) {
            try {
                const selectedOption = currentQuestion.options.find(o => o.id === optionId)
                await supabase
                    .from('student_answers')
                    .upsert({
                        attempt_id: attemptId,
                        question_id: currentQuestion.id,
                        selected_option_id: optionId,
                        is_correct: selectedOption?.is_correct || false
                    }, { onConflict: 'attempt_id,question_id' })
            } catch (error) {
                console.error('Failed to save answer:', error)
                toast.error('Failed to save answer. Will retry...')
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
            setWarningCountdown(10)

            toast.error(`Exit ${currentExitCount}/${maxExits} detected! Return to fullscreen!`)

            let countdown = 10
            const interval = setInterval(() => {
                countdown--
                setWarningCountdown(countdown)
                if (countdown <= 0) clearInterval(interval)
            }, 1000)
            countdownIntervalRef.current = interval

            const timeout = setTimeout(() => {
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current)
                }
                toast.error('Time expired! Auto-submitting exam...')
                exitWarningActiveRef.current = false
                setExitWarningActive(false)
                submitExamConfirmed()
            }, 10000)
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
                    .eq('student_name', savedName)
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
                    .eq('student_name', savedName)
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
                console.error('Error checking attempt:', error)
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
            } catch (e) { console.error('Error parsing flags', e) }
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

        // Clear any existing interval
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
        }

        // Start new interval
        timerIntervalRef.current = setInterval(() => {
            setTimeLeft(prev => {
                const newTime = prev - 1
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
    }, [phase, exitWarningActive, timeLeft])

    // Time expiration
    useEffect(() => {
        if (phase === 'exam' && timeLeft === 0 && !isSubmitting && submitExamRef.current) {
            toast.error('Time is up! Auto-submitting exam...')
            submitExamRef.current()
        }
    }, [phase, timeLeft, isSubmitting])

    // Update last activity and time periodically
    useEffect(() => {
        if (phase !== 'exam' || !attemptId) return

        const interval = setInterval(() => {
            const now = Date.now()
            // Only sync every 10 seconds minimum
            if (now - lastSyncTimeRef.current >= 10000) {
                lastSyncTimeRef.current = now
                supabase.from('student_attempts').update({
                    last_activity: new Date().toISOString(),
                    time_remaining_seconds: timeLeft
                }).eq('id', attemptId).then(({ error }) => {
                    if (error) {
                        console.error('Failed to sync activity:', error)
                    } else {
                        // console.log('Activity synced, time remaining:', timeLeft)
                    }
                })
            }
        }, 10000)

        return () => clearInterval(interval)
    }, [phase, attemptId, timeLeft])

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
                    time_remaining_seconds: timeLeft
                }).eq('id', attemptId)
            }
            return 'Are you sure you want to leave? Your exam progress will be lost.'
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [phase, attemptId, timeLeft])

    // Network status monitoring
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true)
            toast.success('Internet connection restored')
        }
        const handleOffline = () => {
            setIsOnline(false)
            toast.error('Internet connection lost! Exam paused.')
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        setIsOnline(navigator.onLine)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

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

        let blurCount = 0
        const handleBlur = () => {
            if (phase === 'exam') {
                blurCount++
                console.warn(`Window blur detected (count: ${blurCount})`)

                // Update DB with blur/switch count
                if (attemptId) {
                    supabase.from('student_attempts').update({
                        window_switches: blurCount,
                        last_activity: new Date().toISOString()
                    }).eq('id', attemptId)
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
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8 text-center">
                    <div className="w-24 h-24 bg-yellow-100 rounded-full mx-auto mb-6 flex items-center justify-center">
                        <Clock className="w-12 h-12 text-yellow-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Exam Not Active</h1>
                    <p className="text-gray-600 mb-8 max-w-md mx-auto">
                        This exam is currently not active. It may have been closed by the instructor or hasn't started yet.
                    </p>
                    <div className="bg-yellow-50 rounded-xl p-4 mb-8 text-sm text-yellow-800">
                        Please check with your instructor for the correct exam time.
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
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
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <div className="text-xl text-gray-600">Loading exam...</div>
                </div>
            </div>
        )
    }

    // Error
    if (examError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8 text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full mx-auto mb-6 flex items-center justify-center">
                        <XCircle className="w-12 h-12 text-red-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Unable to Load Exam</h1>
                    <p className="text-gray-600 mb-8">{examError}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
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
        const minsRemaining = Math.floor(resumeAttempt.remainingTime / 60)

        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8">
                    <div className="text-center mb-6">
                        <div className="w-24 h-24 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                            <PlayCircle className="w-12 h-12 text-green-600" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back!</h1>
                        <p className="text-gray-600">You have an exam in progress</p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                        <h2 className="font-semibold text-blue-900 mb-4">Exam Progress</h2>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-blue-700 font-medium">Exam Name</div>
                                <div className="text-blue-900">{examData.title}</div>
                            </div>
                            <div>
                                <div className="text-blue-700 font-medium">Student Name</div>
                                <div className="text-blue-900">{studentName}</div>
                            </div>
                            <div>
                                <div className="text-blue-700 font-medium">Time Remaining</div>
                                <div className="text-blue-900 text-xl font-bold">{formatTime(resumeAttempt.remainingTime)}</div>
                            </div>
                            <div>
                                <div className="text-blue-700 font-medium">Questions Answered</div>
                                <div className="text-blue-900">{Object.keys(answers).length} / {questions.length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-yellow-800">
                                <p className="font-semibold mb-1">Important:</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Your previous answers have been saved</li>
                                    <li>The timer will continue from where it stopped</li>
                                    <li>You must complete the exam before the time expires</li>
                                    <li>Exit count: {resumeAttempt.exit_count || 0} / {examData.max_exits}</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={resumeExam}
                        disabled={!isOnline}
                        className="w-full bg-green-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <PlayCircle className="w-6 h-6" />
                        Continue Exam
                    </button>

                    {!isOnline && (
                        <p className="text-center text-red-600 text-sm mt-4 flex items-center justify-center gap-2">
                            <WifiOff className="w-4 h-4" />
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
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-8">
                    {isReturningStudent ? (
                        <div>
                            <div className="text-center mb-6">
                                <div className="w-24 h-24 bg-blue-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                                    <PlayCircle className="w-12 h-12 text-blue-600" />
                                </div>
                                <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back, {savedName}!</h1>
                                <p className="text-gray-600">Ready to start your exam?</p>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                <h2 className="font-semibold text-blue-900 mb-2">Exam Information</h2>
                                <ul className="space-y-2 text-sm text-blue-800">
                                    <li className="flex items-center gap-2">
                                        <FileText className="w-4 h-4" />
                                        <span>Exam: {examData.title}</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Timer className="w-4 h-4" />
                                        <span>Duration: {examData.duration_minutes} minutes</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <ClipboardList className="w-4 h-4" />
                                        <span>Questions: {questions.length}</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Target className="w-4 h-4" />
                                        <span>Total Points: {totalPoints}</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <Award className="w-4 h-4" />
                                        <span>Pass Score: {examData.pass_score}%</span>
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <DoorOpen className="w-4 h-4" />
                                        <span>Maximum exits: {examData.max_exits}</span>
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                                <h2 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Important Rules
                                </h2>
                                <ul className="space-y-2 text-sm text-yellow-800">
                                    <li>• The exam will run in fullscreen mode</li>
                                    <li>• You have 10 seconds to return if you exit fullscreen</li>
                                    <li>• After {examData.max_exits} exits, the exam will auto-submit</li>
                                    <li>• If you disconnect, you can resume within 15 minutes</li>
                                    <li>• Do not refresh or close this page</li>
                                    <li>• Copy/paste and right-click are disabled</li>
                                </ul>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setStudentName('')
                                        localStorage.removeItem(`exam_${params.id}_student_name`)
                                        setResumeAttempt(null)
                                        setPhase('start')
                                    }}
                                    className="px-6 py-4 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition"
                                >
                                    Not {savedName}?
                                </button>
                                <button
                                    onClick={() => startExam(savedName || undefined)}
                                    disabled={!isOnline}
                                    className="flex-1 bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <PlayCircle className="w-6 h-6" />
                                    {!isOnline ? 'Waiting for connection...' : 'Start Exam'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">{examData.title}</h1>
                            {examData.description && (
                                <p className="text-gray-600 mb-6">{examData.description}</p>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                                <h2 className="font-semibold text-blue-900 mb-2">Exam Information</h2>
                                <ul className="space-y-2 text-sm text-blue-800">
                                    <li>⏱ Duration: {examData.duration_minutes} minutes</li>
                                    <li>📝 Questions: {questions.length}</li>
                                    <li>🎯 Total Points: {totalPoints}</li>
                                    <li>✓ Pass Score: {examData.pass_score}%</li>
                                    <li>🚪 Maximum exits: {examData.max_exits}</li>
                                </ul>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                                <h2 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" />
                                    Important Rules
                                </h2>
                                <ul className="space-y-2 text-sm text-yellow-800">
                                    <li>• The exam will run in fullscreen mode</li>
                                    <li>• You have 10 seconds to return if you exit fullscreen</li>
                                    <li>• After {examData.max_exits} exits, the exam will auto-submit</li>
                                    <li>• If you disconnect, you can resume within 15 minutes</li>
                                    <li>• Do not refresh or close this page</li>
                                    <li>• Copy/paste and right-click are disabled</li>
                                </ul>
                            </div>

                            <div className="mb-6">
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
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Enter your full name"
                                    disabled={!isOnline}
                                    autoComplete="name"
                                />
                            </div>

                            <button
                                onClick={() => startExam()}
                                disabled={!isOnline || !studentName.trim()}
                                className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {!isOnline ? 'Waiting for connection...' : 'Start Exam'}
                            </button>

                            {!isOnline && (
                                <p className="text-center text-red-600 text-sm mt-4 flex items-center justify-center gap-2">
                                    <WifiOff className="w-4 h-4" />
                                    No internet connection
                                </p>
                            )}
                        </div>
                    )}
                </div>
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
            {/* Offline Modal */}
            {!isOnline && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/90 backdrop-blur-md">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
                        <div className="text-center">
                            <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <WifiOff className="w-12 h-12 text-red-600 animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connection Lost</h2>
                            <p className="text-gray-600 mb-6">
                                Your internet connection has been lost.
                                <br />
                                <span className="font-semibold text-red-600">Do not close or refresh this page.</span>
                            </p>
                            <div className="p-4 bg-yellow-50 rounded-xl mb-4 text-sm text-yellow-800 text-left">
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Exam timer is paused</li>
                                    <li>Your answers are saved locally</li>
                                    <li>Will resume when connection is restored</li>
                                    <li>You have 15 minutes to reconnect</li>
                                </ul>
                            </div>
                            <div className="text-sm text-gray-500">
                                Time remaining: {formatTime(timeLeft)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Submit Modal */}
            {showSubmitModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSubmitting && setShowSubmitModal(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="w-12 h-12 text-blue-600" />
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
                                    className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
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