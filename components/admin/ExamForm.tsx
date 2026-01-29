'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import {
    ArrowLeft, Sparkles, Plus, Trash2, Save, Clock, Target,
    Shuffle, Eye, DoorOpen, FileText, CheckCircle2, AlertCircle,
    ChevronDown, ChevronUp, GripVertical, Wand2, Share2
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import ExamPreviewModal from './ExamPreviewModal'
import ShareExamModal from './ShareExamModal'

export interface Question {
    id: string
    question_text: string
    points: number
    options: {
        id: string
        option_text: string
        is_correct: boolean
    }[]
}

interface ExamFormProps {
    initialData?: {
        exam: any
        questions: Question[]
    }
    isEditing?: boolean
}

export default function ExamForm({ initialData, isEditing = false }: ExamFormProps) {
    const { admin } = useAuthStore()
    const router = useRouter()
    const [saving, setSaving] = useState(false)

    // Form State
    const [title, setTitle] = useState(initialData?.exam?.title || '')
    const [description, setDescription] = useState(initialData?.exam?.description || '')
    const [duration, setDuration] = useState(initialData?.exam?.duration_minutes || 60)
    const [passScore, setPassScore] = useState(initialData?.exam?.pass_score || 50)

    // Settings
    const [shuffleQuestions, setShuffleQuestions] = useState(initialData?.exam?.shuffle_questions ?? true)
    const [shuffleOptions, setShuffleOptions] = useState(initialData?.exam?.shuffle_options ?? true)
    const [showResults, setShowResults] = useState(initialData?.exam?.show_results ?? true)

    // Security
    const [maxExits, setMaxExits] = useState(initialData?.exam?.max_exits || 3)
    const [offlineGraceMinutes, setOfflineGraceMinutes] = useState(initialData?.exam?.offline_grace_minutes || 10)
    const [exitWarningSeconds, setExitWarningSeconds] = useState(initialData?.exam?.exit_warning_seconds || 10)
    const [requiresAccessCode, setRequiresAccessCode] = useState(initialData?.exam?.requires_access_code || false)
    const [accessCode, setAccessCode] = useState(initialData?.exam?.access_code || '')

    // Questions Management
    const [questions, setQuestions] = useState<Question[]>(initialData?.questions || [])
    const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null) // Accordion state

    // AI State
    const [aiPrompt, setAiPrompt] = useState('')
    const [aiLoading, setAiLoading] = useState(false)
    const [aiQuestionCount, setAiQuestionCount] = useState(5)
    const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('medium')
    const [aiQuestionType, setAiQuestionType] = useState<'conceptual' | 'practical' | 'mixed'>('mixed')

    // Modal State
    const [showPreview, setShowPreview] = useState(false)
    const [showShare, setShowShare] = useState(false)
    const [savedExamData, setSavedExamData] = useState<{ id: string, title: string, duration: number, questionsCount: number, accessCode?: string | null } | null>(
        initialData?.exam ? {
            id: initialData.exam.id,
            title: initialData.exam.title,
            duration: initialData.exam.duration_minutes,
            questionsCount: initialData.questions.length,
            accessCode: initialData.exam.access_code
        } : null
    )

    // Handlers
    const addManualQuestion = () => {
        const id = Date.now().toString()
        setQuestions([...questions, {
            id,
            question_text: '',
            points: 1,
            options: [
                { id: `${id}-1`, option_text: '', is_correct: false },
                { id: `${id}-2`, option_text: '', is_correct: false },
            ]
        }])
        setExpandedQuestion(id) // Auto expand new question
    }

    const updateQuestion = (id: string, field: keyof Question, value: any) => {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q))
    }

    const updateOption = (qId: string, oId: string, value: string) => {
        setQuestions(prev => prev.map(q =>
            q.id === qId
                ? { ...q, options: q.options.map(o => o.id === oId ? { ...o, option_text: value } : o) }
                : q
        ))
    }

    const toggleCorrectOption = (qId: string, oId: string) => {
        setQuestions(prev => prev.map(q =>
            q.id === qId
                ? { ...q, options: q.options.map(o => ({ ...o, is_correct: o.id === oId })) } // Single select behavior
                : q
        ))
    }

    const addOption = (qId: string) => {
        setQuestions(prev => prev.map(q => {
            if (q.id === qId && q.options.length < 6) {
                return {
                    ...q,
                    options: [...q.options, { id: `${Date.now()}`, option_text: '', is_correct: false }]
                }
            }
            return q
        }))
    }

    const deleteOption = (qId: string, oId: string) => {
        setQuestions(prev => prev.map(q => {
            if (q.id === qId && q.options.length > 2) {
                return { ...q, options: q.options.filter(o => o.id !== oId) }
            }
            return q
        }))
    }

    // AI Logic
    const generateWithAI = async () => {
        if (!aiPrompt.trim()) return toast.error('Please enter a topic')
        setAiLoading(true)
        try {
            const existingTexts = questions.map(q => q.question_text).filter(t => t.trim().length > 0)
            const response = await fetch('/api/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    count: aiQuestionCount,
                    difficulty: aiDifficulty,
                    type: aiQuestionType,
                    existingQuestions: existingTexts
                })
            })
            if (!response.ok) throw new Error('Generation failed')
            const data = await response.json()
            if (!data.questions?.length) throw new Error('No questions returned')

            const newQs: Question[] = data.questions.map((q: any, i: number) => ({
                id: `ai-${Date.now()}-${i}`,
                question_text: q.question,
                points: q.points || 1,
                options: q.options.map((opt: string, oi: number) => ({
                    id: `opt-${Date.now()}-${i}-${oi}`,
                    option_text: opt,
                    is_correct: oi === q.correctIndex
                }))
            }))

            setQuestions(prev => [...prev, ...newQs])
            toast.success(`Generated ${newQs.length} questions`)
            setAiPrompt('')
        } catch (err) {
            toast.error('Failed to generate questions')
        } finally {
            setAiLoading(false)
        }
    }

    // Save Logic
    const handleSave = async () => {
        if (!title.trim()) return toast.error('Title is required')
        if (questions.length === 0) return toast.error('Add at least one question')

        // Validation with a clean toast
        const invalidQ = questions.find(q => !q.question_text.trim() || !q.options.some(o => o.is_correct) || q.options.some(o => !o.option_text.trim()))
        if (invalidQ) return toast.error('Please complete all question fields and select correct answers')

        setSaving(true)
        try {
            const payload = {
                title, description, duration_minutes: duration, pass_score: passScore,
                shuffle_questions: shuffleQuestions, shuffle_options: shuffleOptions, show_results: showResults,
                max_exits: maxExits, offline_grace_minutes: offlineGraceMinutes, exit_warning_seconds: exitWarningSeconds,
                requires_access_code: requiresAccessCode, access_code: requiresAccessCode ? accessCode : null,
                questions: questions.map(q => ({
                    question_text: q.question_text,
                    points: q.points,
                    options: q.options.map(o => ({ option_text: o.option_text, is_correct: o.is_correct }))
                }))
            }

            const url = isEditing && initialData?.exam?.id
                ? `/api/admin/exam/update/${initialData.exam.id}`
                : '/api/admin/exam/create'

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to save')

            toast.success(isEditing ? 'Exam updated!' : 'Exam created!')

            // Set saved data for share modal
            const newExamId = data.examId || (initialData?.exam?.id)
            setSavedExamData({
                id: newExamId,
                title,
                duration,
                questionsCount: questions.length,
                accessCode: requiresAccessCode ? accessCode : null
            })

            // Show share modal
            setShowShare(true)

            // Optional: delay redirect or remove it to let user interact with share modal
            // router.push('/admin/dashboard') 
            // router.refresh()
        } catch (err: any) {
            toast.error(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-24 font-sans">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/admin/dashboard" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-900 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Exam' : 'Create Exam'}</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 hidden sm:block">
                            {questions.length} Questions • {questions.reduce((acc, q) => acc + q.points, 0)} Points
                        </span>

                        <button
                            onClick={() => setShowPreview(true)}
                            className="p-2 text-gray-500 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
                            title="Preview as Student"
                        >
                            <Eye className="w-5 h-5" />
                        </button>

                        {savedExamData && (
                            <button
                                onClick={() => setShowShare(true)}
                                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Share Exam"
                            >
                                <Share2 className="w-5 h-5" />
                            </button>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-black text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 transition-all shadow-sm"
                        >
                            {saving ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            Save
                        </button>
                    </div>
                </div>
            </div>

            <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

                {/* 1. Basic Details Card */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" /> Exam Configuration
                        </h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Exam Title</label>
                            <input
                                value={title} onChange={e => setTitle(e.target.value)}
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                                placeholder="e.g. Advanced React Patterns"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                            <textarea
                                value={description} onChange={e => setDescription(e.target.value)} rows={2}
                                className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-black/5 focus:border-black transition-all resize-none"
                                placeholder="Brief overview for students..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (mins)</label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="number" value={duration} onChange={e => setDuration(Number(e.target.value))}
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Pass Score (%)</label>
                            <div className="relative">
                                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="number" value={passScore} onChange={e => setPassScore(Number(e.target.value))} min={1} max={100}
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. Security & Access */}
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                            <DoorOpen className="w-4 h-4 text-orange-600" /> Security & Access
                        </h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Shuffle</label>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={shuffleQuestions} onChange={e => setShuffleQuestions(e.target.checked)} className="rounded border-gray-300 text-black focus:ring-black" />
                                        <span className="text-sm font-medium text-gray-700">Shuffle Questions</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={shuffleOptions} onChange={e => setShuffleOptions(e.target.checked)} className="rounded border-gray-300 text-black focus:ring-black" />
                                        <span className="text-sm font-medium text-gray-700">Shuffle Options</span>
                                    </label>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Proctoring</label>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-600">Max Exits</span>
                                        <input type="number" value={maxExits} onChange={e => setMaxExits(Number(e.target.value))} className="w-16 px-2 py-1 text-sm border rounded" />
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-600">Warn (sec)</span>
                                        <input type="number" value={exitWarningSeconds} onChange={e => setExitWarningSeconds(Number(e.target.value))} className="w-16 px-2 py-1 text-sm border rounded" />
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Access</label>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={requiresAccessCode} onChange={e => setRequiresAccessCode(e.target.checked)} className="rounded border-gray-300 text-black focus:ring-black" />
                                        <span className="text-sm font-medium text-gray-700">Require Code</span>
                                    </label>
                                    {requiresAccessCode && (
                                        <input
                                            type="text" value={accessCode} onChange={e => setAccessCode(e.target.value)}
                                            placeholder="Enter Code"
                                            className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-black outline-none"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3. Questions Area */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Questions</h2>
                        <button onClick={addManualQuestion} className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors">
                            <Plus className="w-4 h-4" /> Add Question
                        </button>
                    </div>

                    {/* AI Generation */}
                    <div className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800 shadow-xl overflow-hidden relative">
                        {/* Background decoration */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none" />

                        <div className="relative">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm shadow-inner ring-1 ring-white/20">
                                    <Sparkles className="w-6 h-6 text-purple-300" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">AI Question Generator</h2>
                                    <p className="text-sm text-gray-400 font-medium">Generate high-quality questions instantly with advanced controls</p>
                                </div>
                            </div>

                            {/* AI Controls */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                {/* Question Count Slider */}
                                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors">
                                    <label className="flex justify-between items-center text-sm font-medium text-gray-300 mb-4">
                                        <span>Count</span>
                                        <span className="bg-purple-500/20 text-purple-200 px-2 py-0.5 rounded text-xs ring-1 ring-purple-500/40">{aiQuestionCount} Qs</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="3"
                                        max="15"
                                        value={aiQuestionCount}
                                        onChange={(e) => setAiQuestionCount(Number(e.target.value))}
                                        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        disabled={aiLoading}
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-500 mt-2 font-mono uppercase">
                                        <span>Min: 3</span>
                                        <span>Max: 15</span>
                                    </div>
                                </div>

                                {/* Difficulty Selector */}
                                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors">
                                    <label className="block text-sm font-medium text-gray-300 mb-3">Difficulty</label>
                                    <div className="flex gap-1 bg-black/20 p-1 rounded-lg">
                                        {(['easy', 'medium', 'hard', 'mixed'] as const).map((level) => (
                                            <button
                                                key={level}
                                                onClick={() => setAiDifficulty(level)}
                                                disabled={aiLoading}
                                                className={`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all duration-200 ${aiDifficulty === level
                                                    ? 'bg-white text-gray-900 shadow-sm'
                                                    : 'text-gray-400 hover:text-gray-200'
                                                    }`}
                                            >
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Question Type Selector */}
                                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors">
                                    <label className="block text-sm font-medium text-gray-300 mb-3">Type</label>
                                    <select
                                        value={aiQuestionType}
                                        onChange={(e) => setAiQuestionType(e.target.value as any)}
                                        disabled={aiLoading}
                                        className="w-full px-3 py-2 bg-black/20 border-0 rounded-lg text-sm text-gray-200 focus:ring-1 focus:ring-purple-500 cursor-pointer hover:bg-black/30 transition-colors"
                                    >
                                        <option value="mixed">Mixed (Balanced)</option>
                                        <option value="conceptual">Conceptual (Theory)</option>
                                        <option value="practical">Practical (Applied)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Prompt Input */}
                            <div className="flex gap-3">
                                <div className="flex-1 relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Wand2 className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        value={aiPrompt}
                                        onChange={(e) => setAiPrompt(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && generateWithAI()}
                                        className="block w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 focus:bg-white/10 transition-all shadow-sm sm:text-sm"
                                        placeholder="Describe the exam topic (e.g., 'React Hooks and State Management')..."
                                        disabled={aiLoading}
                                    />
                                </div>
                                <button
                                    onClick={generateWithAI}
                                    disabled={aiLoading}
                                    className="px-6 py-3.5 bg-white text-gray-900 rounded-xl hover:bg-purple-50 hover:text-purple-900 transition-all font-bold text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[140px] justify-center active:scale-95"
                                >
                                    {aiLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            <span>Generating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            <span>Generate</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Questions List */}
                    <div className="space-y-4">
                        {questions.map((q, idx) => (
                            <div key={q.id} className="bg-white border border-gray-200 rounded-xl shadow-sm transition-all hover:border-gray-300 group">
                                {/* Question Header (Collapsed/Expanded) */}
                                <div
                                    className="flex items-start gap-4 p-4 cursor-pointer"
                                    onClick={() => setExpandedQuestion(expandedQuestion === q.id ? null : q.id)}
                                >
                                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 text-gray-500 rounded-full text-xs font-bold">
                                        {idx + 1}
                                    </span>
                                    <div className="flex-1 pt-1">
                                        {expandedQuestion !== q.id ? (
                                            <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                                {q.question_text || <span className="text-gray-400 italic">New Question...</span>}
                                            </p>
                                        ) : (
                                            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Editing Question</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                            {q.points} pts
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setQuestions(prev => prev.filter(item => item.id !== q.id)); }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        {expandedQuestion === q.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </div>

                                {/* Expanded Editor */}
                                {expandedQuestion === q.id && (
                                    <div className="p-4 pt-0 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
                                        <div className="mt-4 mb-4">
                                            <textarea
                                                value={q.question_text} autoFocus
                                                onChange={e => updateQuestion(q.id, 'question_text', e.target.value)}
                                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium"
                                                placeholder="Enter your question here..."
                                                rows={2}
                                            />
                                        </div>

                                        <div className="space-y-2.5">
                                            {q.options.map((opt, optIdx) => (
                                                <div key={opt.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${opt.is_correct ? 'bg-green-50/50 border-green-200' : 'bg-white border-transparent hover:border-gray-200'}`}>
                                                    <div className="flex items-center justify-center relative">
                                                        <input
                                                            type="radio"
                                                            name={`correct-${q.id}`}
                                                            checked={opt.is_correct}
                                                            onChange={() => toggleCorrectOption(q.id, opt.id)}
                                                            className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded-full checked:border-green-500 checked:bg-green-500 transition-all cursor-pointer"
                                                        />
                                                        <CheckCircle2 className="w-3 h-3 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100" />
                                                    </div>

                                                    <input
                                                        value={opt.option_text}
                                                        onChange={e => updateOption(q.id, opt.id, e.target.value)}
                                                        className={`flex-1 bg-transparent border-b border-gray-200 focus:border-black outline-none px-2 py-1 text-sm ${opt.is_correct ? 'font-medium text-green-900' : 'text-gray-700'}`}
                                                        placeholder={`Option ${optIdx + 1}`}
                                                    />

                                                    {q.options.length > 2 && (
                                                        <button onClick={() => deleteOption(q.id, opt.id)} className="opacity-0 group-hover/opt:opacity-100 p-1.5 text-gray-400 hover:text-red-500 rounded">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            {q.options.length < 6 && (
                                                <button onClick={() => addOption(q.id)} className="ml-9 text-xs font-semibold text-blue-600 hover:underline">
                                                    + Add Option
                                                </button>
                                            )}
                                        </div>

                                        <div className="mt-4 flex justify-end">
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs font-medium text-gray-500">Points:</label>
                                                <input
                                                    type="number" value={q.points} min={1}
                                                    onChange={e => updateQuestion(q.id, 'points', Number(e.target.value))}
                                                    className="w-16 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-black"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Modals */}
            <ExamPreviewModal
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                examTitle={title}
                durationMinutes={duration}
                questions={questions}
                settings={{
                    shuffleQuestions,
                    shuffleOptions,
                    showResults
                }}
            />

            {savedExamData && (
                <ShareExamModal
                    isOpen={showShare}
                    onClose={() => {
                        setShowShare(false)
                        // If it came from a "Create" action, we might want to go back to dashboard after closing share
                        // But if it was just a manual "Share" click, we stay.
                        // For now, let's keep it simple and stay on page.
                    }}
                    examData={savedExamData}
                />
            )}
        </div>
    )
}
