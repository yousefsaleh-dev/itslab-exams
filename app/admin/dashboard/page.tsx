'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase, Exam } from '@/lib/supabase'
import { Plus, FileText, Users, LogOut, Trash2, Copy, ExternalLink, TrendingUp, Search, Trophy, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function AdminDashboard() {
    const { admin, logout } = useAuthStore()
    const router = useRouter()
    const [exams, setExams] = useState<Exam[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [avgPassRate, setAvgPassRate] = useState<string>('—')

    useEffect(() => {
        if (!admin) {
            router.push('/admin/login')
            return
        }
        fetchExams()
    }, [admin, router])

    const fetchExams = async () => {
        try {
            const response = await fetch(`/api/admin/exams?adminId=${admin?.id}`)
            const data = await response.json()

            if (!data.success) {
                throw new Error(data.error || 'Failed to load exams')
            }

            const fetchedExams = data.exams || []
            setExams(fetchedExams)

            // Calculate real avg pass rate from this admin's exams
            if (fetchedExams.length > 0) {
                try {
                    const examIds = fetchedExams.map((e: Exam) => e.id)
                    const { data: attempts } = await supabase
                        .from('student_attempts')
                        .select('score, exam_id')
                        .in('exam_id', examIds)
                        .eq('completed', true)
                        .not('score', 'is', null)

                    if (attempts && attempts.length > 0) {
                        // Count how many passed (score >= exam's pass_score)
                        const passScoreMap: Record<string, number> = {}
                        fetchedExams.forEach((e: Exam) => { passScoreMap[e.id] = e.pass_score })

                        const passedCount = attempts.filter(
                            (a: any) => a.score >= (passScoreMap[a.exam_id] || 50)
                        ).length

                        const rate = Math.round((passedCount / attempts.length) * 100)
                        setAvgPassRate(`${rate}%`)
                    } else {
                        setAvgPassRate('—')
                    }
                } catch {
                    setAvgPassRate('—')
                }
            } else {
                setAvgPassRate('—')
            }
        } catch (error) {
            toast.error('Failed to load exams')
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = async () => {
        try {
            await fetch('/api/admin/logout', { method: 'POST' })
        } catch (error) {
            console.error('Logout failed:', error)
        }
        logout()
        router.push('/admin/login')
        toast.success('Logged out successfully')
    }

    const deleteExam = async (examId: string) => {
        if (!confirm('Are you sure you want to delete this exam? This action cannot be undone.')) return

        try {
            const response = await fetch('/api/admin/exam/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId })
            })

            const data = await response.json()

            if (response.status === 401) {
                logout()
                router.push('/admin/login')
                toast.error('Session expired')
                return
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete exam')
            }

            setExams(exams.filter(e => e.id !== examId))
            toast.success('Exam deleted successfully')
        } catch (error: any) {
            toast.error(error.message || 'Failed to delete exam')
        }
    }

    const copyLink = (examId: string) => {
        const link = `${window.location.origin}/exam/${examId}`
        navigator.clipboard.writeText(link)
        toast.success('Link copied to clipboard!')
    }

    const cloneExam = async (examId: string) => {
        if (!confirm('Do you want to clone this exam?')) return

        try {
            const response = await fetch('/api/exam/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId })
            })

            const data = await response.json()

            if (response.status === 401) {
                logout()
                router.push('/admin/login')
                toast.error('Session expired')
                return
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to clone exam')
            }

            toast.success(`Exam cloned successfully! (${data.questionCount} questions)`)
            fetchExams()
        } catch (error: any) {
            toast.error(error.message || 'Failed to clone exam')
        }
    }

    const filteredExams = exams.filter(exam =>
        exam.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (loading) {
        return (
            <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-black rounded-lg">
                            <Trophy className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-gray-900">Exams System</h1>
                            <p className="text-xs text-gray-500 font-medium">Workspace</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">Welcome, {admin?.name}</span>
                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard
                        title="Total Exams"
                        value={exams.length}
                        icon={<FileText className="w-5 h-5" />}
                    />
                    <StatCard
                        title="Active Now"
                        value={exams.filter(e => e.is_active).length}
                        icon={<Users className="w-5 h-5 text-green-600" />}
                    />
                    <StatCard
                        title="Avg Pass Rate"
                        value={avgPassRate}
                        icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
                    />
                </div>

                {/* Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Overview</h2>
                        <p className="text-gray-500 mt-1 text-sm">Manage your assessment environment</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search exams..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-black focus:border-transparent transition-all w-64 shadow-sm"
                            />
                        </div>
                        <Link
                            href="/admin/create-exam"
                            className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            New Exam
                        </Link>
                    </div>
                </div>

                {/* Clean Table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">Exam Name</th>
                                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Specs</th>
                                <th className="py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredExams.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="py-12 text-center text-gray-500">
                                        No exams found.
                                    </td>
                                </tr>
                            ) : (
                                filteredExams.map((exam) => (
                                    <tr key={exam.id} className="group hover:bg-gray-50 transition-colors">
                                        <td className="py-4 px-6">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-gray-100 rounded-lg text-gray-600 group-hover:bg-white group-hover:shadow-sm transition-all">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-gray-900">{exam.title}</div>
                                                    <div className="text-sm text-gray-500 truncate max-w-[280px]">{exam.description || 'No description'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${exam.is_active
                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                : 'bg-gray-100 text-gray-600 border-gray-200'
                                                }`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${exam.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                {exam.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col gap-1 text-sm text-gray-500">
                                                <span>{exam.duration_minutes} mins</span>
                                                <span>Pass: {exam.pass_score}%</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => copyLink(exam.id)} className="p-2 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors" title="Copy Link">
                                                    <Link2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => cloneExam(exam.id)} className="p-2 text-gray-400 hover:text-green-600 rounded-md hover:bg-green-50 transition-colors" title="Clone Exam">
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <Link href={`/admin/exam/${exam.id}`} className="p-2 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors" title="Details">
                                                    <ExternalLink className="w-4 h-4" />
                                                </Link>
                                                <button onClick={() => deleteExam(exam.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors" title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}

function StatCard({ title, value, icon }: {
    title: string
    value: string | number
    icon: React.ReactNode
}) {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
                <span className="text-gray-500 text-sm font-medium">{title}</span>
                <div className="text-gray-400">
                    {icon}
                </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 tracking-tight">{value}</div>
        </div>
    )
}