'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase, Exam, StudentAttempt } from '@/lib/supabase'
import { ArrowLeft, Users, CheckCircle, XCircle, Clock, AlertTriangle, Copy, Download, Edit, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function ExamDetailsPage() {
    const params = useParams()
    const router = useRouter()
    const { admin } = useAuthStore()
    const [exam, setExam] = useState<Exam | null>(null)
    const [attempts, setAttempts] = useState<StudentAttempt[]>([])
    const [questions, setQuestions] = useState<any[]>([])
    const [answers, setAnswers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'attempts' | 'analytics'>('attempts')

    useEffect(() => {
        if (!admin) {
            router.push('/admin/login')
            return
        }
        fetchExamDetails()
    }, [admin, params.id])

    const fetchExamDetails = async () => {
        try {
            // Use API route to get full exam data (bypasses RLS) - include adminId for auth
            const response = await fetch(`/api/exam/${params.id}/details?adminId=${admin?.id}`)

            if (!response.ok) {
                throw new Error('Failed to fetch exam')
            }

            const data = await response.json()

            if (!data.success) {
                throw new Error(data.error || 'Failed to load exam details')
            }

            setExam(data.exam)
            setQuestions(data.questions || [])

            // Fetch attempts separately (no RLS issues here)
            const { data: attemptsData, error: attemptsError } = await supabase
                .from('student_attempts')
                .select('*')
                .eq('exam_id', params.id)
                .order('started_at', { ascending: false })

            if (attemptsError) throw attemptsError
            setAttempts(attemptsData || [])

            // Fetch Answers for Analytics
            if (attemptsData && attemptsData.length > 0) {
                const attemptIds = attemptsData.map(a => a.id)
                const { data: answersData, error: answersError } = await supabase
                    .from('student_answers')
                    .select('question_id, is_correct')
                    .in('attempt_id', attemptIds)

                if (!answersError) {
                    setAnswers(answersData || [])
                }
            }
        } catch (error) {
            toast.error('Failed to load exam details')
        } finally {
            setLoading(false)
        }
    }

    const copyLink = () => {
        const link = `${window.location.origin}/exam/${params.id}`
        navigator.clipboard.writeText(link)
        toast.success('Exam link copied!')
    }

    const toggleExamStatus = async () => {
        if (!exam) return

        try {
            // Use secure API route with admin authentication
            const response = await fetch('/api/admin/exam/toggle-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId: exam.id, adminId: admin?.id })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update exam status')
            }

            setExam({ ...exam, is_active: data.is_active })
            toast.success(data.message || `Exam ${exam.is_active ? 'deactivated' : 'activated'}`)
        } catch (error: any) {
            toast.error(error.message || 'Failed to update exam status')
        }
    }

    const exportToExcel = async (mode: 'simple' | 'detailed' = 'simple') => {
        try {
            // Dynamic import for xlsx
            const XLSX = await import('xlsx')

            const exportData = attempts.map(attempt => {
                const passed = attempt.completed && attempt.score && attempt.score >= exam!.pass_score
                const status = attempt.completed
                    ? (passed ? 'Success' : 'Failed')
                    : 'In Progress'

                if (mode === 'simple') {
                    return {
                        'Name': attempt.student_name,
                        'Status': status,
                        'Score': attempt.score ? `${attempt.score.toFixed(1)}%` : 'N/A'
                    }
                }

                return {
                    'Student Name': attempt.student_name,
                    'Status': attempt.completed ? 'Completed' : 'In Progress',
                    'Score (%)': attempt.score ? attempt.score.toFixed(2) : 'N/A',
                    'Points Earned': attempt.score && attempt.total_points
                        ? Math.round((attempt.score / 100) * attempt.total_points)
                        : 'N/A',
                    'Total Points': attempt.total_points || 'N/A',
                    'Time Spent (min)': attempt.time_spent_seconds
                        ? Math.floor(attempt.time_spent_seconds / 60)
                        : 'N/A',
                    'Exit Count': attempt.exit_count,
                    'Window Switches': attempt.window_switches || 0,
                    'Passed': passed ? 'Yes' : 'No',
                    'Started At': new Date(attempt.started_at).toLocaleString(),
                    'Completed At': attempt.completed_at
                        ? new Date(attempt.completed_at).toLocaleString()
                        : 'N/A'
                }
            })

            const ws = XLSX.utils.json_to_sheet(exportData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Results')

            // Auto-size columns
            const maxWidth = exportData.reduce((w: any, r: any) => {
                return Object.keys(r).reduce((acc, key) => {
                    const cellWidth = String(r[key]).length + 2
                    return { ...acc, [key]: Math.max(acc[key] || 10, cellWidth) }
                }, w)
            }, {})

            ws['!cols'] = Object.keys(maxWidth).map(key => ({ wch: maxWidth[key] }))

            const fileName = `${exam?.title.replace(/\s+/g, '_')}_${mode === 'detailed' ? 'Detailed_' : ''}Results.xlsx`
            XLSX.writeFile(wb, fileName)
            toast.success(`${mode === 'detailed' ? 'Detailed' : 'Simple'} results exported!`)
        } catch (error) {
            // console.error('Export error:', error)
            toast.error('Failed to export results')
        }
    }

    const deleteAttempt = async (attemptId: string) => {
        if (!confirm('Are you sure you want to delete this attempt?')) return

        try {
            // Use secure API route with admin authentication
            const response = await fetch('/api/admin/attempt/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, adminId: admin?.id })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete attempt')
            }

            setAttempts(attempts.filter(a => a.id !== attemptId))
            toast.success('Attempt deleted')
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete attempt')
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading...</div>
            </div>
        )
    }

    if (!exam) {
        return (
            <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center">
                <div className="text-xl text-gray-600">Exam not found</div>
            </div>
        )
    }

    const completedAttempts = attempts.filter(a => a.completed)
    const avgScore = completedAttempts.length > 0
        ? completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / completedAttempts.length
        : 0
    const passedAttempts = completedAttempts.filter(a => a.score && a.score >= exam.pass_score)
    const passRate = completedAttempts.length > 0
        ? ((passedAttempts.length / completedAttempts.length) * 100)
        : 0

    // Analytics Calculations
    const getQuestionStats = () => {
        return questions.map(q => {
            const qAnswers = answers.filter(a => a.question_id === q.id)
            const totalAnswered = qAnswers.length
            const correct = qAnswers.filter(a => a.is_correct).length
            const correctRate = totalAnswered > 0 ? (correct / totalAnswered) * 100 : 0
            return { ...q, totalAnswered, correctRate }
        }).sort((a, b) => a.correctRate - b.correctRate) // Sort by hardest first
    }

    const questionStats = getQuestionStats()
    const hardestQuestions = questionStats.slice(0, 5)

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white/80 backdrop-blur-xl shadow-sm border-b border-gray-200/60 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/admin/dashboard"
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
                                <p className="text-gray-600">{exam.description}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => exportToExcel('simple')}
                                disabled={attempts.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                            >
                                <Download className="w-5 h-5" />
                                Export
                            </button>
                            <button
                                onClick={() => exportToExcel('detailed')}
                                disabled={attempts.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-green-800 text-white rounded-xl hover:bg-green-900 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                            >
                                <Download className="w-5 h-5" />
                                Detailed Excel
                            </button>
                            <Link
                                href={`/admin/edit-exam/${exam.id}`}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition shadow-md"
                            >
                                <Edit className="w-5 h-5" />
                                Edit Exam
                            </Link>
                            <button
                                onClick={copyLink}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition shadow-md"
                            >
                                <Copy className="w-5 h-5" />
                                Copy Link
                            </button>
                            <button
                                onClick={toggleExamStatus}
                                className={`px-4 py-2 rounded-xl transition font-semibold shadow-md ${exam.is_active
                                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                    }`}
                            >
                                {exam.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                    <StatCard
                        icon={<Users className="w-8 h-8 text-gray-900" />}
                        title="Total Attempts"
                        value={attempts.length}
                    />
                    <StatCard
                        icon={<CheckCircle className="w-8 h-8 text-green-600" />}
                        title="Completed"
                        value={completedAttempts.length}
                    />
                    <StatCard
                        icon={<CheckCircle className="w-8 h-8 text-blue-600" />}
                        title="Pass Rate"
                        value={`${passRate.toFixed(1)}%`}
                    />
                    <StatCard
                        icon={<Clock className="w-8 h-8 text-orange-600" />}
                        title="In Progress"
                        value={attempts.filter(a => !a.completed).length}
                    />
                    <StatCard
                        icon={<AlertTriangle className="w-8 h-8 text-red-600" />}
                        title="Avg Score"
                        value={`${avgScore.toFixed(1)}%`}
                    />
                </div>

                {/* Exam Info */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-gray-200/60 p-6 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Exam Information</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <InfoItem label="Duration" value={`${exam.duration_minutes} minutes`} />
                        <InfoItem label="Pass Score" value={`${exam.pass_score}%`} />
                        <InfoItem label="Max Exits" value={exam.max_exits} />
                        <InfoItem label="Status" value={exam.is_active ? 'Active' : 'Inactive'} />
                        <InfoItem label="Shuffle Questions" value={exam.shuffle_questions ? 'Yes' : 'No'} />
                        <InfoItem label="Shuffle Options" value={exam.shuffle_options ? 'Yes' : 'No'} />
                        <InfoItem label="Show Results" value={exam.show_results ? 'Yes' : 'No'} />
                        <InfoItem label="Created" value={new Date(exam.created_at).toLocaleDateString()} />
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-4 mb-6 border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('attempts')}
                        className={`pb-2 font-medium transition ${activeTab === 'attempts' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Student Attempts
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`pb-2 font-medium transition ${activeTab === 'analytics' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Detailed Analytics
                    </button>
                </div>

                {activeTab === 'analytics' ? (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        {/* Question Performance Analysis */}
                        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-gray-200/60 p-6">
                            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-orange-500" />
                                Hardest Questions
                            </h2>
                            <div className="space-y-4">
                                {hardestQuestions.map((q, idx) => (
                                    <div key={q.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-medium text-gray-900 w-3/4">
                                                {idx + 1}. {q.question_text}
                                            </span>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${q.correctRate < 50 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {q.correctRate.toFixed(1)}% Correct
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className={`h-2 rounded-full ${q.correctRate < 50 ? 'bg-red-500' : 'bg-yellow-500'}`}
                                                style={{ width: `${q.correctRate}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Answered by {q.totalAnswered} students
                                        </p>
                                    </div>
                                ))}
                                {hardestQuestions.length === 0 && (
                                    <p className="text-gray-500">No data available yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-gray-200/60 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <h2 className="text-xl font-semibold">Student Attempts</h2>
                        </div>


                        {attempts.length === 0 ? (
                            <div className="px-6 py-12 text-center text-gray-500">
                                No attempts yet
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Student Name
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Score
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Violations
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Time
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Exits
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Switches
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Started
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {attempts.map((attempt) => (
                                            <tr key={attempt.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-medium text-gray-900">{attempt.student_name}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {attempt.completed ? (
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                            Completed
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                                            In Progress
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {attempt.completed ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">
                                                                {attempt.score?.toFixed(1)}%
                                                            </span>
                                                            {attempt.score && attempt.score >= exam.pass_score ? (
                                                                <CheckCircle className="w-4 h-4 text-green-600" />
                                                            ) : (
                                                                <XCircle className="w-4 h-4 text-red-600" />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                {/* Violations Column */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(() => {
                                                            const activities = Array.isArray(attempt.suspicious_activities) ? attempt.suspicious_activities : []
                                                            const devtoolsCount = activities.filter((a: any) => a.type === 'devtools_detected').length
                                                            const copyCount = activities.filter((a: any) => a.type === 'copy_attempt').length
                                                            const hasViolations = devtoolsCount > 0 || copyCount > 0 || (attempt.exit_count || 0) > exam.max_exits || (attempt.window_switches || 0) > 3

                                                            return (
                                                                <>
                                                                    {devtoolsCount > 0 && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800" title={`DevTools detected ${devtoolsCount} times`}>
                                                                            🛡️ DevTools {devtoolsCount > 1 && `(${devtoolsCount})`}
                                                                        </span>
                                                                    )}
                                                                    {copyCount > 0 && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800" title={`${copyCount} copy attempts`}>
                                                                            📋 Copy ({copyCount})
                                                                        </span>
                                                                    )}
                                                                    {(attempt.exit_count || 0) > exam.max_exits && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800" title="Excessive exits">
                                                                            🚪 Exits
                                                                        </span>
                                                                    )}
                                                                    {(attempt.window_switches || 0) > 3 && (
                                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800" title={`${attempt.window_switches} window switches`}>
                                                                            🔄 Switches
                                                                        </span>
                                                                    )}
                                                                    {!hasViolations && (
                                                                        <span className="text-gray-400 text-xs">✓ Clean</span>
                                                                    )}
                                                                </>
                                                            )
                                                        })()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {attempt.time_spent_seconds ? (
                                                        <span>{Math.floor(attempt.time_spent_seconds / 60)} min</span>
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={attempt.exit_count > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                                                        {attempt.exit_count}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={(attempt.window_switches || 0) > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}>
                                                        {attempt.window_switches || 0}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(attempt.started_at).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {attempt.completed && (
                                                        <Link
                                                            href={`/admin/attempt/${attempt.id}`}
                                                            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                                                        >
                                                            View Details
                                                        </Link>
                                                    )}
                                                    <button
                                                        onClick={() => deleteAttempt(attempt.id)}
                                                        className="ml-4 text-red-600 hover:text-red-800"
                                                        title="Delete attempt"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>

            <style jsx>{`
                @keyframes blob {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
            `}</style>
        </div>
    )
}

function StatCard({ icon, title, value }: {
    icon: React.ReactNode
    title: string
    value: string | number
}) {
    return (
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-gray-200/60 p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-gray-50 rounded-xl">
                    {icon}
                </div>
                <div>
                    <p className="text-gray-600 text-sm font-medium">{title}</p>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                </div>
            </div>
        </div>
    )
}

function InfoItem({ label, value }: { label: string; value: string | number | boolean }) {
    return (
        <div>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="font-semibold text-gray-900">{String(value)}</p>
        </div>
    )
}