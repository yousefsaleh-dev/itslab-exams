'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase, Exam, StudentAttempt } from '@/lib/supabase'
import { ArrowLeft, Users, CheckCircle, XCircle, Clock, AlertTriangle, Copy, Download, Edit, Trash2, StopCircle, LogOut, ChevronRight, Search, Eye, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import ExamPreviewModal from '@/components/admin/ExamPreviewModal'
import ShareExamModal from '@/components/admin/ShareExamModal'

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
    const [selectedAttemptForViolations, setSelectedAttemptForViolations] = useState<StudentAttempt | null>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [showPreview, setShowPreview] = useState(false)
    const [showShare, setShowShare] = useState(false)

    useEffect(() => {
        if (!admin) {
            router.push('/admin/login')
            return
        }
        fetchExamDetails()
    }, [admin, params.id])

    const fetchExamDetails = async () => {
        try {
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

            // Fetch attempts via API (Bypassing RLS)
            const attemptsResponse = await fetch(`/api/admin/exam/${params.id}/attempts?adminId=${admin?.id}`)
            const attemptsData = await attemptsResponse.json()

            if (attemptsData.success) {
                setAttempts(attemptsData.attempts || [])
                setAnswers(attemptsData.answers || [])
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
            XLSX.writeFile(wb, `${exam?.title}_${mode}_Results.xlsx`)
            toast.success('Export Successful')
        } catch (error) {
            toast.error('Failed to export')
        }
    }

    const deleteAttempt = async (attemptId: string) => {
        if (!confirm('Are you sure you want to delete this attempt?')) return

        try {
            const response = await fetch('/api/admin/attempt/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, adminId: admin?.id })
            })

            if (!response.ok) throw new Error('Failed to delete')

            setAttempts(attempts.filter(a => a.id !== attemptId))
            toast.success('Attempt deleted')
        } catch (error) {
            toast.error('Failed to delete attempt')
        }
    }

    const forceFinishAttempt = async (attemptId: string) => {
        if (!confirm('Are you sure you want to force finish this attempt? This will mark it as completed.')) return

        try {
            const response = await fetch('/api/admin/attempt/force-finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId, adminId: admin?.id })
            })

            if (!response.ok) throw new Error('Failed to update')

            // Update local state
            setAttempts(attempts.map(a =>
                a.id === attemptId
                    ? { ...a, completed: true, completed_at: new Date().toISOString() }
                    : a
            ))
            toast.success('Attempt marked as completed')
        } catch (error) {
            toast.error('Failed to force finish attempt')
        }
    }

    if (loading) return <div className="min-h-screen grid place-items-center bg-white text-gray-500">Loading...</div>
    if (!exam) return <div className="min-h-screen grid place-items-center bg-white text-gray-500">Exam not found</div>

    const filteredAttempts = attempts.filter(a =>
        a.student_name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const completedAttempts = attempts.filter(a => a.completed)
    const passedAttempts = completedAttempts.filter(a => a.score && a.score >= exam.pass_score)
    const passRate = completedAttempts.length > 0 ? ((passedAttempts.length / completedAttempts.length) * 100) : 0
    const avgScore = completedAttempts.length > 0 ? completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / completedAttempts.length : 0

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/dashboard" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">{exam.title}</h1>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className={exam.is_active ? "text-green-600 font-medium" : "text-gray-400"}>
                                    {exam.is_active ? '● Active' : '● Inactive'}
                                </span>
                                <span>|</span>
                                <span>{attempts.length} Total Attempts</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={copyLink} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Copy Link">
                            <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => exportToExcel('simple')} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                            <Download className="w-4 h-4" />
                            <span>Export</span>
                        </button>

                        <button
                            onClick={() => setShowPreview(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            <Eye className="w-4 h-4" />
                            <span>Preview</span>
                        </button>

                        <button
                            onClick={() => setShowShare(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                        >
                            <Share2 className="w-4 h-4" />
                            <span>Share</span>
                        </button>
                        <Link href={`/admin/edit-exam/${exam.id}`} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                            <Edit className="w-4 h-4" />
                            <span>Edit</span>
                        </Link>
                        <button
                            onClick={toggleExamStatus}
                            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${exam.is_active
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                        >
                            {exam.is_active ? 'Deactivate' : 'Activate Exam'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Stats Bar */}
                <div className="grid grid-cols-4 gap-4 mb-8 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <StatBox label="Completion Rate" value={`${Math.round((completedAttempts.length / (attempts.length || 1)) * 100)}%`} sub={`${completedAttempts.length}/${attempts.length}`} />
                    <StatBox label="Pass Rate" value={`${passRate.toFixed(1)}%`} sub={`${passedAttempts.length} passed`} />
                    <StatBox label="Average Score" value={`${avgScore.toFixed(1)}%`} />
                    <StatBox label="Pending" value={(attempts.length - completedAttempts.length).toString()} highlight={true} />
                </div>

                {/* Tabs & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg self-start">
                        <button
                            onClick={() => setActiveTab('attempts')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'attempts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Attempts
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Analytics
                        </button>
                    </div>

                    {activeTab === 'attempts' && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-1.5 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/5 w-64"
                            />
                        </div>
                    )}
                </div>

                {/* Content */}
                {activeTab === 'attempts' ? (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Security</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredAttempts.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No attempts found</td>
                                    </tr>
                                ) : (
                                    filteredAttempts.map((attempt) => {
                                        // Calc violations
                                        const activities = Array.isArray(attempt.suspicious_activities) ? attempt.suspicious_activities : []
                                        const devtools = activities.filter((a: any) => a.type === 'devtools_detected').length
                                        const copy = activities.filter((a: any) => a.type === 'copy_attempt').length
                                        const exit = attempt.exit_count || 0
                                        const switches = attempt.window_switches || 0
                                        const totalViolations = devtools + copy + exit + switches + (activities.length > (devtools + copy) ? activities.length - (devtools + copy) : 0)
                                        const hasViolations = totalViolations > 0

                                        return (
                                            <tr key={attempt.id} className="hover:bg-gray-50 group">
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{attempt.student_name}</div>
                                                    <div className="text-xs text-gray-400">{new Date(attempt.started_at).toLocaleDateString()}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {attempt.completed ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                                            Completed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-100">
                                                            In Progress
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-sm">
                                                    {attempt.completed ? (
                                                        <span className={attempt.score && attempt.score >= exam.pass_score ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                                                            {attempt.score?.toFixed(1)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {hasViolations ? (
                                                        <button
                                                            onClick={() => setSelectedAttemptForViolations(attempt)}
                                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium border border-red-100 hover:bg-red-100 hover:border-red-200 transition-colors"
                                                        >
                                                            <AlertTriangle className="w-3 h-3" />
                                                            {totalViolations} Flags
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 text-xs font-medium border border-gray-100">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Clean
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                    {attempt.time_spent_seconds ? Math.floor(attempt.time_spent_seconds / 60) + 'm' : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {!attempt.completed && (
                                                            <button
                                                                onClick={() => forceFinishAttempt(attempt.id)}
                                                                className="p-1.5 text-orange-500 hover:bg-orange-50 rounded-md transition-colors"
                                                                title="Force Finish (Mark as Completed)"
                                                            >
                                                                <StopCircle className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => deleteAttempt(attempt.id)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                            title="Delete Attempt"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                        {attempt.completed && (
                                                            <Link href={`/admin/attempt/${attempt.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                                <ChevronRight className="w-4 h-4" />
                                                            </Link>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    // Analytics Dashboard
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* 1. High-Level Insights */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Score Distribution</h3>
                                <div className="h-40 flex items-end justify-between gap-2">
                                    {(() => {
                                        const ranges = [0, 20, 40, 60, 80, 100];
                                        const scores = attempts.filter(a => a.completed).map(a => a.score || 0);
                                        const counts = [0, 0, 0, 0, 0];
                                        scores.forEach(s => {
                                            const idx = Math.min(Math.floor(s / 20), 4);
                                            counts[idx]++;
                                        });
                                        const max = Math.max(...counts, 1);

                                        return counts.map((count, i) => (
                                            <div key={i} className="flex flex-col items-center gap-2 flex-1 group">
                                                <div className="relative w-full flex items-end justify-center h-32 bg-gray-50 rounded-lg overflow-hidden">
                                                    <div
                                                        className={`w-full transition-all duration-1000 ${i === 4 ? 'bg-green-500' : i === 3 ? 'bg-blue-500' : 'bg-gray-400'}`}
                                                        style={{ height: `${(count / max) * 100}%`, opacity: count > 0 ? 1 : 0.1 }}
                                                    />
                                                    <div className="absolute top-2 font-bold text-xs text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {count}
                                                    </div>
                                                </div>
                                                <span className="text-[10px] text-gray-400 font-medium">{ranges[i]}-{ranges[i + 1]}</span>
                                            </div>
                                        ))
                                    })()}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Time Efficiency</h3>
                                <div className="space-y-6">
                                    {(() => {
                                        const completed = attempts.filter(a => a.completed && a.time_spent_seconds)
                                        if (completed.length === 0) return <p className="text-sm text-gray-400">No completed attempts yet.</p>

                                        const avgTime = completed.reduce((sum, a) => sum + (a.time_spent_seconds || 0), 0) / completed.length
                                        const totalDuration = (exam.duration_minutes || 60) * 60
                                        const percentageUsed = Math.min((avgTime / totalDuration) * 100, 100)

                                        const fastFinishers = completed.filter(a => (a.time_spent_seconds || 0) < totalDuration * 0.5).length
                                        const timeCrunched = completed.filter(a => (a.time_spent_seconds || 0) > totalDuration * 0.9).length

                                        return (
                                            <>
                                                <div>
                                                    <div className="flex justify-between items-end mb-2">
                                                        <div>
                                                            <div className="text-2xl font-bold text-gray-900">{Math.floor(avgTime / 60)}m {Math.round(avgTime % 60)}s</div>
                                                            <div className="text-xs text-gray-500">Avg. Completion Time</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs font-bold text-gray-900">{exam.duration_minutes}m</div>
                                                            <div className="text-xs text-gray-400">Limit</div>
                                                        </div>
                                                    </div>
                                                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${percentageUsed > 90 ? 'bg-red-500' : percentageUsed > 75 ? 'bg-orange-500' : 'bg-green-500'}`}
                                                            style={{ width: `${percentageUsed}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 mt-4">
                                                    <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                                        <div className="text-lg font-bold text-green-700">{fastFinishers}</div>
                                                        <div className="text-[10px] text-green-600 font-medium uppercase">Fast Finishers</div>
                                                        <div className="text-[10px] text-green-500">(&lt; 50% time)</div>
                                                    </div>
                                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                                                        <div className="text-lg font-bold text-orange-700">{timeCrunched}</div>
                                                        <div className="text-[10px] text-orange-600 font-medium uppercase">Using Full Time</div>
                                                        <div className="text-[10px] text-orange-500">(&gt; 90% time)</div>
                                                    </div>
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2 absolute top-6 left-6">Pass Rate</h3>
                                <div className="relative w-32 h-32 mt-4">
                                    {/* Simple Pure CSS Donut Chart */}
                                    {/* Background Circle */}
                                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                                        <path
                                            className="text-gray-100"
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                        />
                                        {/* Progress Circle */}
                                        <path
                                            className={`${passRate >= 50 ? 'text-green-500' : 'text-orange-500'} drop-shadow-sm transition-all duration-1000 ease-out`}
                                            strokeDasharray={`${passRate}, 100`}
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                                        <span className="text-3xl font-bold text-gray-900">{Math.round(passRate)}%</span>
                                    </div>
                                </div>
                                <div className="mt-4 text-sm text-gray-500">
                                    <span className="font-semibold text-gray-900">{passedAttempts.length}</span> passed out of <span className="font-semibold text-gray-900">{completedAttempts.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Detailed Question Analysis */}
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-semibold text-gray-900">Question Difficulty Breakdown</h3>
                            </div>
                            <div className="p-6">
                                <div className="space-y-6">
                                    {questions.map((q, idx) => {
                                        const qAnswers = answers.filter(a => a.question_id === q.id);
                                        const count = qAnswers.length;
                                        const correct = qAnswers.filter(a => a.is_correct).length;
                                        const rate = count > 0 ? (correct / count) * 100 : 0;

                                        // Determine difficulty visual
                                        let colorClass = 'bg-green-500';
                                        let difficultyLabel = 'Easy';
                                        if (rate < 40) { colorClass = 'bg-red-500'; difficultyLabel = 'Hard'; }
                                        else if (rate < 70) { colorClass = 'bg-yellow-500'; difficultyLabel = 'Medium'; }

                                        return (
                                            <div key={idx} className="group">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1 pr-4">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-xs font-mono text-gray-400">Q{idx + 1}</span>
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white ${colorClass}`}>
                                                                {difficultyLabel}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm font-medium text-gray-900 line-clamp-2" title={q.question_text}>
                                                            {q.question_text}
                                                        </p>
                                                    </div>
                                                    <div className="text-right min-w-[80px]">
                                                        <span className="text-lg font-bold text-gray-900">{Math.round(rate)}%</span>
                                                        <p className="text-xs text-gray-500">Correct</p>
                                                    </div>
                                                </div>
                                                {/* Bar */}
                                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden relative">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                                                        style={{ width: `${rate}%` }}
                                                    />
                                                </div>
                                                <div className="mt-1 flex justify-between text-xs text-gray-400">
                                                    <span>{correct} correct</span>
                                                    <span>{count} attempts</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Violation Modal */}
            {selectedAttemptForViolations && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 rounded-lg">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">Security Report</h3>
                                    <p className="text-xs text-gray-500">{selectedAttemptForViolations.student_name}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAttemptForViolations(null)} className="p-2 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            <div className="flex gap-4 mb-6">
                                <div className="flex-1 p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                    <div className="text-2xl font-bold text-gray-900">{selectedAttemptForViolations.exit_count || 0}</div>
                                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Exits</div>
                                </div>
                                <div className="flex-1 p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                    <div className="text-2xl font-bold text-gray-900">{selectedAttemptForViolations.window_switches || 0}</div>
                                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Switches</div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2 mb-3">Timeline</h4>
                                {(selectedAttemptForViolations.suspicious_activities?.length > 0) ? (
                                    selectedAttemptForViolations.suspicious_activities.map((act: any, idx: number) => (
                                        <div key={idx} className="flex gap-3 text-sm">
                                            <div className="mt-1 min-w-[4px] w-1 bg-red-200 rounded-full" />
                                            <div className="flex-1 pb-3">
                                                <div className="flex justify-between">
                                                    <span className="font-medium text-gray-900">
                                                        {act.type === 'devtools_detected' ? 'DevTools Detected' :
                                                            act.type === 'copy_attempt' ? 'Content Copy (Right Click)' : 'Suspicious Activity'}
                                                    </span>
                                                    <span className="text-gray-400 text-xs font-mono">{new Date(act.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                                <p className="text-gray-500 text-xs mt-0.5">{act.details}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-500 italic text-center py-4">No specific timeline events logged.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {exam && (
                <>
                    <ExamPreviewModal
                        isOpen={showPreview}
                        onClose={() => setShowPreview(false)}
                        examTitle={exam.title}
                        durationMinutes={exam.duration_minutes}
                        questions={questions || []}
                        settings={{
                            shuffleQuestions: exam.shuffle_questions,
                            shuffleOptions: exam.shuffle_options,
                            showResults: exam.show_results
                        }}
                    />
                    <ShareExamModal
                        isOpen={showShare}
                        onClose={() => setShowShare(false)}
                        examData={{
                            id: exam.id,
                            title: exam.title,
                            duration: exam.duration_minutes,
                            questionsCount: questions?.length || 0,
                            accessCode: exam.access_code
                        }}
                    />
                </>
            )}
        </div>
    )
}

function StatBox({ label, value, sub, highlight }: { label: string, value: string, sub?: string, highlight?: boolean }) {
    return (
        <div className={`p-4 rounded-xl border ${highlight ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${highlight ? 'text-orange-600' : 'text-gray-500'}`}>{label}</p>
            <p className={`text-2xl font-bold ${highlight ? 'text-orange-900' : 'text-gray-900'}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
    )
}