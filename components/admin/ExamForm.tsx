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
    const [offlineGraceMinutes, setOfflineGraceMinutes] = useState(initialData?.exam?.offline_grace_minutes || 10)
    const [exitWarningSeconds, setExitWarningSeconds] = useState(initialData?.exam?.exit_warning_seconds || 10)

    // Access code
    const [requiresAccessCode, setRequiresAccessCode] = useState(initialData?.exam?.requires_access_code || false)
    const [accessCode, setAccessCode] = useState(initialData?.exam?.access_code || '')

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
                // console.error('API Error:', errorData)
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
            // console.error('AI Generation Error:', error)
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
            const examId = initialData?.exam?.id

            // Prepare request body
            const requestBody = {
                adminId: admin.id,
                title,
                description,
                duration_minutes: duration,
                pass_score: passScore,
                shuffle_questions: shuffleQuestions,
                shuffle_options: shuffleOptions,
                show_results: showResults,
                max_exits: maxExits,
                offline_grace_minutes: offlineGraceMinutes,
                exit_warning_seconds: exitWarningSeconds,
                requires_access_code: requiresAccessCode,
                access_code: requiresAccessCode ? accessCode : null,
                questions: questions.map(q => ({
                    question_text: q.question_text,
                    points: q.points,
                    options: q.options.map(o => ({
                        option_text: o.option_text,
                        is_correct: o.is_correct
                    }))
                }))
            }

            // Call appropriate API endpoint
            const endpoint = isEditing && examId
                ? `/api/admin/exam/update/${examId}`
                : '/api/admin/exam/create'

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to save exam')
            }

            if (data.settingsOnly) {
                toast.success('Exam settings updated! ⚠️ Questions are locked (students have completed this exam)')
            } else {
                toast.success(isEditing ? 'Exam updated successfully!' : 'Exam created successfully!')
            }

            router.push('/admin/dashboard')
            router.refresh()
        } catch (error: any) {
            console.error('Save exam error:', error)
            toast.error(error.message || (isEditing ? 'Failed to update exam' : 'Failed to save exam'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/admin/dashboard"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-700" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">
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
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <div className="flex items-center gap-2 mb-6">
                        <FileText className="w-5 h-5 text-gray-900" />
                        <h2 className="text-xl font-semibold text-gray-900">Exam Details</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Exam Title *
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
                                placeholder="e.g., JavaScript Fundamentals"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Duration (minutes) *
                            </label>
                            <input
                                type="number"
                                value={duration}
                                onChange={(e) => setDuration(Number(e.target.value))}
                                min="1"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
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
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
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

                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock className="w-4 h-4 text-orange-600" />
                                Offline Grace (min)
                            </label>
                            <input
                                type="number"
                                value={offlineGraceMinutes}
                                onChange={(e) => setOfflineGraceMinutes(Number(e.target.value))}
                                min="0"
                                max="60"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                            />
                            <p className="text-xs text-gray-500 mt-1">Timer pauses when offline</p>
                        </div>

                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Clock className="w-4 h-4 text-red-600" />
                                Exit Warning (sec)
                            </label>
                            <input
                                type="number"
                                value={exitWarningSeconds}
                                onChange={(e) => setExitWarningSeconds(Number(e.target.value))}
                                min="5"
                                max="60"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                            />
                            <p className="text-xs text-gray-500 mt-1">Countdown before failing</p>
                            {exitWarningSeconds > duration * 60 && (
                                <p className="text-xs text-red-600 mt-1 font-medium">
                                    ⚠️ Warning duration exceeds exam duration
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <input
                                type="checkbox"
                                id="shuffle-q"
                                checked={shuffleQuestions}
                                onChange={(e) => setShuffleQuestions(e.target.checked)}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-2 focus:ring-gray-900"
                            />
                            <label htmlFor="shuffle-q" className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                <Shuffle className="w-3.5 h-3.5 text-gray-900" />
                                Shuffle Questions
                            </label>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <input
                                type="checkbox"
                                id="shuffle-o"
                                checked={shuffleOptions}
                                onChange={(e) => setShuffleOptions(e.target.checked)}
                                className="w-4 h-4 text-gray-900 rounded focus:ring-2 focus:ring-gray-900"
                            />
                            <label htmlFor="shuffle-o" className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                <Shuffle className="w-3.5 h-3.5 text-gray-900" />
                                Shuffle Options
                            </label>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
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

                    {/* Access Code */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <input
                                type="checkbox"
                                id="requiresAccessCode"
                                checked={requiresAccessCode}
                                onChange={(e) => setRequiresAccessCode(e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="requiresAccessCode" className="text-sm font-medium text-gray-700">
                                Require Access Code
                            </label>
                        </div>
                        {requiresAccessCode && (
                            <input
                                type="text"
                                value={accessCode}
                                onChange={(e) => setAccessCode(e.target.value)}
                                placeholder="Enter access code"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                            Students will need to enter this code to start the exam
                        </p>
                    </div>
                </div>

                {/* AI Generation */}
                <div className="bg-gray-900 rounded-xl p-6 mb-6 border border-gray-800">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-white/10 rounded-lg">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">AI Question Generator</h2>
                            <p className="text-sm text-gray-300">Let AI create questions for you with advanced controls</p>
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
                            className="px-6 py-3 bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50 flex items-center gap-2 shadow-md"
                        >
                            {aiLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
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
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-900">Questions ({questions.length})</h2>
                        <button
                            onClick={addManualQuestion}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors shadow-md"
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
                                <div key={question.id} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
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
                        className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
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
