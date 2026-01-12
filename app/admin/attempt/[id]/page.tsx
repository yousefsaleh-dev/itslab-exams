'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle, User, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface AttemptDetails {
    id: string
    student_name: string
    score: number | null
    total_points: number | null
    time_spent_seconds: number | null
    exit_count: number
    window_switches: number | null
    suspicious_activities: any[]
    completed: boolean
    started_at: string
    completed_at: string | null
    exam: {
        id: string
        title: string
        pass_score: number
    }
    answers: Array<{
        question_id: string
        selected_option_id: string | null
        is_correct: boolean | null
        question: {
            question_text: string
            points: number
            options: Array<{
                id: string
                option_text: string
                is_correct: boolean
            }>
        }
    }>
}

export default function AttemptDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const { admin } = useAuthStore()
    const [attempt, setAttempt] = useState<AttemptDetails | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!admin) {
            router.push('/admin/login')
            return
        }
        fetchAttemptDetails()
    }, [admin, params.id])

    const fetchAttemptDetails = async () => {
        try {
            const { data: attemptData, error: attemptError } = await supabase
                .from('student_attempts')
                .select(`
          *,
          exam:exams (
            id,
            title,
            pass_score
          )
        `)
                .eq('id', params.id)
                .single()

            if (attemptError) throw attemptError

            const { data: answersData, error: answersError } = await supabase
                .from('student_answers')
                .select(`
          *,
          question:questions (
            question_text,
            points,
            options (
              id,
              option_text,
              is_correct
            )
          )
        `)
                .eq('attempt_id', params.id)

            if (answersError) throw answersError

            setAttempt({
                ...attemptData,
                answers: answersData || []
            } as AttemptDetails)
        } catch (error) {
            // console.error('Error fetching attempt details:', error)
            toast.error('Failed to load attempt details')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading...</div>
            </div>
        )
    }

    if (!attempt) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-xl text-gray-600">Attempt not found</div>
            </div>
        )
    }

    const passed = attempt.completed && attempt.score !== null && attempt.score >= attempt.exam.pass_score
    const correctAnswers = attempt.answers.filter(a => a.is_correct).length
    const totalQuestions = attempt.answers.length

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/admin/exam/${attempt.exam.id}`}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
                                Attempt Details
                            </h1>
                            <p className="text-sm text-gray-600">{attempt.exam.title}</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Student Info Card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-gray-900 rounded-lg">
                                <User className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{attempt.student_name}</h2>
                                <p className="text-sm text-gray-600">
                                    {new Date(attempt.started_at).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        {attempt.completed && (
                            <div className={`px-4 py-2 rounded-lg font-semibold ${passed
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-red-100 text-red-700 border border-red-200'
                                }`}>
                                {passed ? 'PASSED' : 'FAILED'}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <StatBox
                            icon={<Trophy className="w-5 h-5 text-gray-900" />}
                            label="Score"
                            value={attempt.score !== null ? `${attempt.score.toFixed(1)}%` : 'N/A'}
                        />
                        <StatBox
                            icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
                            label="Correct"
                            value={`${correctAnswers}/${totalQuestions}`}
                        />
                        <StatBox
                            icon={<Clock className="w-5 h-5 text-gray-600" />}
                            label="Time Spent"
                            value={attempt.time_spent_seconds ? `${Math.floor(attempt.time_spent_seconds / 60)} min` : 'N/A'}
                        />
                        <StatBox
                            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
                            label="Exits"
                            value={attempt.exit_count}
                        />
                        <StatBox
                            icon={<AlertTriangle className="w-5 h-5 text-orange-600" />}
                            label="Switches"
                            value={attempt.window_switches || 0}
                        />
                    </div>
                </div>

                {/* Violations Timeline */}
                {attempt.suspicious_activities && Array.isArray(attempt.suspicious_activities) && attempt.suspicious_activities.length > 0 && (
                    <div className="bg-white rounded-xl border border-red-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <h2 className="text-xl font-semibold text-gray-900">Security Violations</h2>
                            <span className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                                {attempt.suspicious_activities.length} violations
                            </span>
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {attempt.suspicious_activities.map((activity: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex-shrink-0 mt-0.5">
                                        {activity.type === 'devtools_detected' && (
                                            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                                <span className="text-sm">🛡️</span>
                                            </div>
                                        )}
                                        {activity.type === 'copy_attempt' && (
                                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                                                <span className="text-sm">📋</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-gray-900">
                                                {activity.type === 'devtools_detected' ? 'DevTools Attempt' :
                                                    activity.details?.includes('Right-click') ? 'Right-Click Attempt' : 'Copy Attempt'}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {new Date(activity.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-0.5">{activity.details}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Questions and Answers */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900">Question-by-Question Breakdown</h2>

                    {attempt.answers.map((answer, idx) => {
                        const selectedOption = answer.question.options.find(o => o.id === answer.selected_option_id)
                        const correctOption = answer.question.options.find(o => o.is_correct)

                        return (
                            <div
                                key={answer.question_id}
                                className="bg-white rounded-xl border border-gray-200 p-6"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg font-semibold text-sm">
                                                Question {idx + 1}
                                            </span>
                                            <span className="text-sm text-gray-600">
                                                {answer.question.points} {answer.question.points === 1 ? 'point' : 'points'}
                                            </span>
                                        </div>
                                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                                            {answer.question.question_text}
                                        </h3>
                                    </div>
                                    <div className={`p-2 rounded-lg ${answer.is_correct
                                        ? 'bg-green-100'
                                        : 'bg-red-100'
                                        }`}>
                                        {answer.is_correct ? (
                                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                                        ) : (
                                            <XCircle className="w-6 h-6 text-red-600" />
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {answer.question.options.map((option) => {
                                        const isSelected = option.id === answer.selected_option_id
                                        const isCorrect = option.is_correct

                                        let bgColor = 'bg-gray-50'
                                        let borderColor = 'border-gray-200'
                                        let textColor = 'text-gray-700'

                                        if (isCorrect) {
                                            bgColor = 'bg-green-50'
                                            borderColor = 'border-green-300'
                                            textColor = 'text-green-900'
                                        } else if (isSelected && !isCorrect) {
                                            bgColor = 'bg-red-50'
                                            borderColor = 'border-red-300'
                                            textColor = 'text-red-900'
                                        }

                                        return (
                                            <div
                                                key={option.id}
                                                className={`p-3 rounded-lg border-2 ${bgColor} ${borderColor} ${textColor} flex items-center justify-between`}
                                            >
                                                <span>{option.option_text}</span>
                                                <div className="flex items-center gap-2">
                                                    {isSelected && (
                                                        <span className="text-xs font-semibold px-2 py-1 bg-white/50 rounded">
                                                            Selected
                                                        </span>
                                                    )}
                                                    {isCorrect && (
                                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </main>
        </div>
    )
}

function StatBox({ icon, label, value }: {
    icon: React.ReactNode
    label: string
    value: string | number
}) {
    return (
        <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span className="text-sm font-medium text-gray-700">{label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
        </div>
    )
}
