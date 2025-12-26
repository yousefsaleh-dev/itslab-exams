'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase, Exam } from '@/lib/supabase'
import { Plus, FileText, Users, LogOut, Trash2, Copy, ExternalLink, TrendingUp, CheckCircle2, XCircle, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function AdminDashboard() {
    const { admin, logout } = useAuthStore()
    const router = useRouter()
    const [exams, setExams] = useState<Exam[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        if (!admin) {
            router.push('/admin/login')
            return
        }
        fetchExams()
    }, [admin, router])

    const fetchExams = async () => {
        try {
            const { data, error } = await supabase
                .from('exams')
                .select('*')
                .eq('admin_id', admin?.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setExams(data || [])
        } catch (error) {
            toast.error('Failed to load exams')
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = () => {
        logout()
        router.push('/admin/login')
        toast.success('Logged out successfully')
    }

    const deleteExam = async (examId: string) => {
        if (!confirm('Are you sure you want to delete this exam?')) return

        try {
            const { error } = await supabase
                .from('exams')
                .delete()
                .eq('id', examId)

            if (error) throw error

            setExams(exams.filter(e => e.id !== examId))
            toast.success('Exam deleted successfully')
        } catch (error) {
            toast.error('Failed to delete exam')
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
            // 1. Fetch full exam data
            const { data: examData, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', examId)
                .single()
            if (examError) throw examError

            const { data: questionsData, error: questionsError } = await supabase
                .from('questions')
                .select('*, options(*)')
                .eq('exam_id', examId)
            if (questionsError) throw questionsError

            // 2. Create new exam (exclude system fields)
            const { id, created_at, ...examDataToClone } = examData

            const { data: newExam, error: newExamError } = await supabase
                .from('exams')
                .insert([{
                    ...examDataToClone,
                    title: `Copy of ${examData.title}`,
                    is_active: false // Default to inactive
                }])
                .select()
                .single()
            if (newExamError) throw newExamError

            // 3. Duplicate questions and options
            // We need to map old questions to new questions to handle options
            for (const q of questionsData || []) {
                const { data: newQuestion, error: newQError } = await supabase
                    .from('questions')
                    .insert([{
                        exam_id: newExam.id,
                        question_text: q.question_text,
                        question_order: q.question_order,
                        points: q.points
                    }])
                    .select()
                    .single()
                if (newQError) throw newQError

                if (q.options && q.options.length > 0) {
                    const newOptions = q.options.map((o: any) => ({
                        question_id: newQuestion.id,
                        option_text: o.option_text,
                        is_correct: o.is_correct,
                        option_order: o.option_order
                    }))
                    const { error: newOptError } = await supabase.from('options').insert(newOptions)
                    if (newOptError) throw newOptError
                }
            }

            toast.success('Exam cloned successfully')
            fetchExams()
        } catch (error) {
            console.error(error)
            toast.error('Failed to clone exam')
        }
    }

    const filteredExams = exams.filter(exam =>
        exam.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading...</div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Admin Dashboard</h1>
                            <p className="text-gray-600">Welcome back, <span className="font-semibold">{admin?.name}</span></p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gradient-to-r hover:from-red-50 hover:to-pink-50 rounded-xl transition-all duration-200 border border-transparent hover:border-red-200"
                        >
                            <LogOut className="w-5 h-5" />
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard
                        icon={<FileText className="w-8 h-8 text-white" />}
                        title="Total Exams"
                        value={exams.length}
                        gradient="from-blue-500 to-cyan-500"
                    />
                    <StatCard
                        icon={<CheckCircle2 className="w-8 h-8 text-white" />}
                        title="Active Exams"
                        value={exams.filter(e => e.is_active).length}
                        gradient="from-green-500 to-emerald-500"
                    />
                    <StatCard
                        icon={<XCircle className="w-8 h-8 text-white" />}
                        title="Inactive"
                        value={exams.filter(e => !e.is_active).length}
                        gradient="from-purple-500 to-pink-500"
                    />
                </div>

                {/* Actions Bar */}
                <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search exams..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <Link
                        href="/admin/create-exam"
                        className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl"
                    >
                        <Plus className="w-5 h-5" />
                        Create New Exam
                    </Link>
                </div>

                {/* Exams List */}
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50/30">
                        <h2 className="text-xl font-semibold text-gray-900">Your Exams</h2>
                    </div>

                    {exams.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-600 text-lg mb-4">No exams yet</p>
                            <Link
                                href="/admin/create-exam"
                                className="text-blue-600 hover:text-blue-700 font-medium"
                            >
                                Create your first exam
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {filteredExams.map((exam) => (
                                <div
                                    key={exam.id}
                                    className="px-6 py-4 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all duration-200"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-lg font-semibold text-gray-900">
                                                    {exam.title}
                                                </h3>
                                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${exam.is_active
                                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                                    }`}>
                                                    {exam.is_active ? '● Active' : '○ Inactive'}
                                                </span>
                                            </div>
                                            <p className="text-gray-600 text-sm mb-2">
                                                {exam.description || 'No description'}
                                            </p>
                                            <div className="flex gap-4 text-sm text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <FileText className="w-4 h-4" />
                                                    {exam.duration_minutes} minutes
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <TrendingUp className="w-4 h-4" />
                                                    Pass: {exam.pass_score}%
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => copyLink(exam.id)}
                                                className="p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all duration-200"
                                                title="Copy exam link"
                                            >
                                                <Copy className="w-5 h-5" />
                                            </button>

                                            <Link
                                                href={`/admin/exam/${exam.id}`}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                                                title="View details"
                                            >
                                                <ExternalLink className="w-5 h-5" />
                                            </Link>

                                            <button
                                                onClick={() => cloneExam(exam.id)}
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200"
                                                title="Clone exam"
                                            >
                                                <Copy className="w-5 h-5" />
                                            </button>

                                            <button
                                                onClick={() => deleteExam(exam.id)}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                                                title="Delete exam"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

function StatCard({ icon, title, value, gradient }: {
    icon: React.ReactNode
    title: string
    value: number
    gradient: string
}) {
    return (
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center gap-4">
                <div className={`p-3 bg-gradient-to-br ${gradient} rounded-xl shadow-md`}>
                    {icon}
                </div>
                <div>
                    <p className="text-gray-600 text-sm font-medium">{title}</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{value}</p>
                </div>
            </div>
        </div>
    )
}