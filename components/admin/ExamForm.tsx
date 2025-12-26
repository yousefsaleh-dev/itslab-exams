'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Sparkles, Plus, Trash2, Save, Clock, Target, Shuffle, Eye, DoorOpen, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

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

    // Exam details
    const [title, setTitle] = useState(initialData?.exam?.title || '')
    const [description, setDescription] = useState(initialData?.exam?.description || '')
    const [duration, setDuration] = useState(initialData?.exam?.duration_minutes || 60)
    const [passScore, setPassScore] = useState(initialData?.exam?.pass_score || 50)
    const [shuffleQuestions, setShuffleQuestions] = useState(initialData?.exam?.shuffle_questions ?? true)
    const [shuffleOptions, setShuffleOptions] = useState(initialData?.exam?.shuffle_options ?? true)
    const [showResults, setShowResults] = useState(initialData?.exam?.show_results ?? true)
    const [maxExits, setMaxExits] = useState(initialData?.exam?.max_exits || 3)

    // Questions
    const [questions, setQuestions] = useState<Question[]>(initialData?.questions || [])
    const [aiPrompt, setAiPrompt] = useState('')
    const [aiLoading, setAiLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    // AI Generation Controls
    const [aiQuestionCount, setAiQuestionCount] = useState(5)
    const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
    const [aiQuestionType, setAiQuestionType] = useState<'conceptual' | 'practical' | 'mixed'>('mixed')

    const addManualQuestion = () => {
        const newQuestion: Question = {
            id: Date.now().toString(),
            question_text: '',
            points: 1,
            options: [
                { id: `${Date.now()}-1`, option_text: '', is_correct: false },
                { id: `${Date.now()}-2`, option_text: '', is_correct: false },
            ]
        }
        setQuestions([...questions, newQuestion])
    }

    const removeQuestion = (questionId: string) => {
        setQuestions(questions.filter(q => q.id !== questionId))
    }

    const updateQuestion = (questionId: string, field: string, value: any) => {
        setQuestions(questions.map(q =>
            q.id === questionId ? { ...q, [field]: value } : q
        ))
    }

    const addOption = (questionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId && q.options.length < 6) {
                return {
                    ...q,
                    options: [...q.options, {
                        id: `${Date.now()}-${q.options.length}`,
                        option_text: '',
                        is_correct: false
                    }]
                }
            }
            return q
        }))
    }

    const removeOption = (questionId: string, optionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId && q.options.length > 2) {
                return {
                    ...q,
                    options: q.options.filter(o => o.id !== optionId)
                }
            }
            return q
        }))
    }

    const updateOption = (questionId: string, optionId: string, field: string, value: any) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                return {
                    ...q,
                    options: q.options.map(o =>
                        o.id === optionId ? { ...o, [field]: value } : o
                    )
                }
            }
            return q
        }))
    }

    const toggleCorrectAnswer = (questionId: string, optionId: string) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                return {
                    ...q,
                    options: q.options.map(o => ({
                        ...o,
                        is_correct: o.id === optionId
                    }))
                }
            }
            return q
        }))
    }

    const generateWithAI = async () => {
        if (!aiPrompt.trim()) {
            toast.error('Please enter a prompt for AI')
            return
        }

        setAiLoading(true)
        try {
            const enhancedPrompt = `${aiPrompt}

Additional requirements:
- Number of questions: ${aiQuestionCount}
- Difficulty level: ${aiDifficulty}
- Question type: ${aiQuestionType === 'conceptual' ? 'focus on theoretical concepts and definitions' : aiQuestionType === 'practical' ? 'focus on practical application and problem-solving' : 'mix of conceptual and practical questions'}`

            const response = await fetch('/api/generate-questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: enhancedPrompt })
            })

            if (!response.ok) {
                const errorData = await response.json()
                console.error('API Error:', errorData)
                throw new Error(errorData.error || 'API request failed')
            }

            const data = await response.json()
            const aiQuestions = data.questions

            if (!Array.isArray(aiQuestions) || aiQuestions.length === 0) {
                throw new Error('No questions generated')
            }

            const newQuestions: Question[] = aiQuestions.map((q: any, idx: number) => ({
                id: `ai-${Date.now()}-${idx}`,
                question_text: q.question,
                points: q.points || 1,
                options: q.options.map((opt: string, optIdx: number) => ({
                    id: `ai-${Date.now()}-${idx}-${optIdx}`,
                    option_text: opt,
                    is_correct: optIdx === q.correctIndex
                }))
            }))

            setQuestions([...questions, ...newQuestions])
            toast.success(`Generated ${newQuestions.length} questions!`)
            setAiPrompt('')
        } catch (error: any) {
            console.error('AI Generation Error:', error)
            toast.error('AI generation failed. Try adding questions manually or use a simpler prompt.')
        } finally {
            setAiLoading(false)
        }
    }

    const saveExam = async () => {
        if (!admin) {
            toast.error('Please login first')
            return
        }

        if (!title.trim()) {
            toast.error('Please enter exam title')
            return
        }

        if (questions.length === 0) {
            toast.error('Please add at least one question')
            return
        }

        // Validate questions
        for (let q of questions) {
            if (!q.question_text.trim()) {
                toast.error('All questions must have text')
                return
            }
            if (!q.options.some(o => o.is_correct)) {
                toast.error('Each question must have a correct answer')
                return
            }
            if (q.options.some(o => !o.option_text.trim())) {
                toast.error('All options must have text')
                return
            }
        }

        setSaving(true)
        try {
            let examId = initialData?.exam?.id

            if (isEditing && examId) {
                // UPDATE EXAM
                const { error: examError } = await supabase
                    .from('exams')
                    .update({
                        title,
                        description,
                        duration_minutes: duration,
                        pass_score: passScore,
                        shuffle_questions: shuffleQuestions,
                        shuffle_options: shuffleOptions,
                        show_results: showResults,
                        max_exits: maxExits,
                    })
                    .eq('id', examId)

                if (examError) throw examError

                // Handle Questions for Edit
                // This is a simplified approach: We will only UPSERT or INSERT questions, NOT DELETE for now to avoid FK issues with attempts.
                // TODO: Handle deletions safely if possible, or just warn user. 
                // Currently, deleted questions in UI will basically be 'ignored' from updates, but stay in DB.
                // To properly handle sync:
                // 1. Get all existing question IDs for this exam.
                // 2. Compare with current questions list.
                // 3. Delete missing ones (if no attempts linked, or soft delete/archive).
                // For this iteration, we will simply UPSERT the current list.

                for (let i = 0; i < questions.length; i++) {
                    const q = questions[i]
                    const qIsNew = q.id.includes('-') || !q.id // rough check for temp ID

                    // Upsert Question
                    const { data: questionData, error: questionError } = await supabase
                        .from('questions')
                        .upsert({
                            id: qIsNew ? undefined : q.id, // Let DB generate ID if new
                            exam_id: examId,
                            question_text: q.question_text,
                            question_order: i,
                            points: q.points
                        })
                        .select()
                        .single()

                    if (questionError) throw questionError

                    // Handle Options
                    // Delete existing options for this question first? No, cascade might lose data.
                    // Better to delete all options for this question and recreate?
                    // Safe approach: Delete options for this question and re-insert. 
                    // Options usually don't have FKs other than to question... oh wait, student_answers checks option_id.
                    // If we delete options, we break student answers.
                    // So we must UPSERT options too.

                    for (let optIdx = 0; optIdx < q.options.length; optIdx++) {
                        const opt = q.options[optIdx]
                        const optIsNew = opt.id.includes('-') || !opt.id

                        const { error: optionsError } = await supabase
                            .from('options')
                            .upsert({
                                id: optIsNew ? undefined : opt.id,
                                question_id: questionData.id,
                                option_text: opt.option_text,
                                is_correct: opt.is_correct,
                                option_order: optIdx
                            })

                        if (optionsError) throw optionsError
                    }
                }

                toast.success('Exam updated successfully!')
            } else {
                // CREATE EXAM
                const { data: examData, error: examError } = await supabase
                    .from('exams')
                    .insert([{
                        admin_id: admin.id,
                        title,
                        description,
                        duration_minutes: duration,
                        pass_score: passScore,
                        shuffle_questions: shuffleQuestions,
                        shuffle_options: shuffleOptions,
                        show_results: showResults,
                        max_exits: maxExits,
                        is_active: true
                    }])
                    .select()
                    .single()

                if (examError) throw examError
                examId = examData.id

                // Insert questions
                for (let i = 0; i < questions.length; i++) {
                    const q = questions[i]

                    const { data: questionData, error: questionError } = await supabase
                        .from('questions')
                        .insert([{
                            exam_id: examId,
                            question_text: q.question_text,
                            question_order: i,
                            points: q.points
                        }])
                        .select()
                        .single()

                    if (questionError) throw questionError

                    // Insert options
                    const optionsToInsert = q.options.map((opt, optIdx) => ({
                        question_id: questionData.id,
                        option_text: opt.option_text,
                        is_correct: opt.is_correct,
                        option_order: optIdx
                    }))

                    const { error: optionsError } = await supabase
                        .from('options')
                        .insert(optionsToInsert)

                    if (optionsError) throw optionsError
                }
                toast.success('Exam created successfully!')
            }

            router.push('/admin/dashboard')
            router.refresh()
        } catch (error) {
            console.error(error)
            toast.error(isEditing ? 'Failed to update exam' : 'Failed to save exam')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/admin/dashboard"
                            className="p-2 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 rounded-lg transition-all duration-200"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                {isEditing ? 'Edit Exam' : 'Create New Exam'}
                            </h1>
                            <p className="text-sm text-gray-600">
                                {isEditing ? 'Update exam details and questions' : 'Design your exam with AI assistance or manually'}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Exam Details */}
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-6 mb-6 hover:shadow-xl transition-shadow duration-300">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">Exam Details</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <FileText className="w-4 h-4 text-blue-600" />
                                Exam Title *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                                placeholder="e.g., JavaScript Fundamentals"
                            />
                        </div>

                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock className="w-4 h-4 text-blue-600" />
                                Duration (minutes) *
                            </label>
                            <input
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                min="1"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                            placeholder="Brief description of the exam"
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Target className="w-4 h-4 text-blue-600" />
                                Pass Score (%)
                            </label>
                            <input
                                type="number"
                                value={passScore}
                                onChange={(e) => setPassScore(Number(e.target.value))}
                                min="0"
                                max="100"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                            />
                        </div>

                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <DoorOpen className="w-4 h-4 text-blue-600" />
                                Max Exits
                            </label>
                            <input
                                type="number"
                                value={maxExits}
                                onChange={(e) => setMaxExits(Number(e.target.value))}
                                min="1"
                                max="10"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                            />
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/50">
                            <input
                                type="checkbox"
                                id="shuffle-q"
                                checked={shuffleQuestions}
                                onChange={(e) => setShuffleQuestions(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label htmlFor="shuffle-q" className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                <Shuffle className="w-3.5 h-3.5 text-blue-600" />
                                Shuffle Questions
                            </label>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200/50">
                            <input
                                type="checkbox"
                                id="shuffle-o"
                                checked={shuffleOptions}
                                onChange={(e) => setShuffleOptions(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <label htmlFor="shuffle-o" className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                <Shuffle className="w-3.5 h-3.5 text-blue-600" />
                                Shuffle Options
                            </label>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200/50">
                        <input
                            type="checkbox"
                            id="show-results"
                            checked={showResults}
                            onChange={(e) => setShowResults(e.target.checked)}
                            className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                        />
                        <label htmlFor="show-results" className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                            <Eye className="w-4 h-4 text-green-600" />
                            Show Results to Students
                        </label>
                    </div>
                </div>

                {/* AI Generation */}
                <div className="bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-500 rounded-2xl shadow-xl p-6 mb-6 border border-purple-300/50 hover:shadow-2xl transition-all duration-300">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">AI Question Generator</h2>
                            <p className="text-sm text-purple-100">Let AI create questions for you with advanced controls</p>
                        </div>
                    </div>

                    {/* AI Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        {/* Question Count Slider */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                            <label className="block text-sm font-medium text-white mb-2">
                                Number of Questions: <span className="font-bold">{aiQuestionCount}</span>
                            </label>
                            <input
                                type="range"
                                min="3"
                                max="15"
                                value={aiQuestionCount}
                                onChange={(e) => setAiQuestionCount(Number(e.target.value))}
                                className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                                disabled={aiLoading}
                            />
                            <div className="flex justify-between text-xs text-purple-100 mt-1">
                                <span>3</span>
                                <span>15</span>
                            </div>
                        </div>

                        {/* Difficulty Selector */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                            <label className="block text-sm font-medium text-white mb-2">Difficulty Level</label>
                            <div className="flex gap-2">
                                {(['easy', 'medium', 'hard'] as const).map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => setAiDifficulty(level)}
                                        disabled={aiLoading}
                                        className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${aiDifficulty === level
                                            ? 'bg-white text-purple-600 shadow-lg'
                                            : 'bg-white/20 text-white hover:bg-white/30'
                                            }`}
                                    >
                                        {level.charAt(0).toUpperCase() + level.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Question Type Selector */}
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                            <label className="block text-sm font-medium text-white mb-2">Question Type</label>
                            <select
                                value={aiQuestionType}
                                onChange={(e) => setAiQuestionType(e.target.value as any)}
                                disabled={aiLoading}
                                className="w-full px-3 py-2 bg-white/95 text-gray-700 rounded-lg focus:ring-2 focus:ring-white transition-all duration-200"
                            >
                                <option value="mixed">Mixed (Balanced)</option>
                                <option value="conceptual">Conceptual (Theory)</option>
                                <option value="practical">Practical (Applied)</option>
                            </select>
                        </div>
                    </div>

                    {/* Prompt Input */}
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && generateWithAI()}
                            className="flex-1 px-4 py-3 bg-white/95 backdrop-blur-sm border-2 border-white/50 rounded-xl focus:ring-2 focus:ring-white focus:border-white transition-all duration-200 placeholder-gray-500"
                            placeholder="e.g., Python loops and conditionals"
                            disabled={aiLoading}
                        />
                        <button
                            onClick={generateWithAI}
                            disabled={aiLoading}
                            className="px-6 py-3 bg-white text-purple-600 rounded-xl hover:bg-purple-50 transition-all duration-200 font-semibold disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-xl"
                        >
                            {aiLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5" />
                                    Generate
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Questions List */}
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-6 mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-900">Questions ({questions.length})</h2>
                        <button
                            onClick={addManualQuestion}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow-md hover:shadow-lg"
                        >
                            <Plus className="w-5 h-5" />
                            Add Manual
                        </button>
                    </div>

                    {questions.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No questions yet. Use AI generator or add manually.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {questions.map((question, qIdx) => (
                                <div key={question.id} className="border border-gray-200 rounded-xl p-4 bg-gradient-to-br from-gray-50 to-blue-50/30 hover:shadow-md transition-shadow duration-200">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className="font-semibold text-gray-700 bg-blue-100 px-3 py-1 rounded-lg">Question {qIdx + 1}</span>
                                        <button
                                            onClick={() => removeQuestion(question.id)}
                                            className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors duration-200"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <textarea
                                        value={question.question_text}
                                        onChange={(e) => updateQuestion(question.id, 'question_text', e.target.value)}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Enter question text"
                                    />

                                    <div className="mb-3">
                                        <label className="block text-sm text-gray-600 mb-1">Points</label>
                                        <input
                                            type="number"
                                            value={question.points}
                                            onChange={(e) => updateQuestion(question.id, 'points', Number(e.target.value))}
                                            min="1"
                                            className="w-24 px-3 py-1 border border-gray-300 rounded-lg"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-gray-700">Options</label>
                                        {question.options.map((option, optIdx) => (
                                            <div key={option.id} className="flex gap-2 items-center">
                                                <input
                                                    type="radio"
                                                    name={`correct-${question.id}`}
                                                    checked={option.is_correct}
                                                    onChange={() => toggleCorrectAnswer(question.id, option.id)}
                                                    className="w-4 h-4 text-green-600"
                                                    title="Mark as correct answer"
                                                />
                                                <input
                                                    type="text"
                                                    value={option.option_text}
                                                    onChange={(e) => updateOption(question.id, option.id, 'option_text', e.target.value)}
                                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    placeholder={`Option ${optIdx + 1}`}
                                                />
                                                {question.options.length > 2 && (
                                                    <button
                                                        onClick={() => removeOption(question.id, option.id)}
                                                        className="text-red-600 hover:bg-red-50 p-2 rounded transition-colors duration-200"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {question.options.length < 6 && (
                                            <button
                                                onClick={() => addOption(question.id)}
                                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                            >
                                                + Add option
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                    <button
                        onClick={saveExam}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-200 font-semibold disabled:opacity-50 shadow-lg hover:shadow-xl"
                    >
                        {saving ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                {isEditing ? 'Updating...' : 'Saving...'}
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                {isEditing ? 'Update Exam' : 'Save Exam'}
                            </>
                        )}
                    </button>
                </div>
            </main>
        </div>
    )
}
