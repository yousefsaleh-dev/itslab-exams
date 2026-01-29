import { useState, useEffect } from 'react'
import {
    X, Clock, MapPin, AlertTriangle, CheckCircle,
    ChevronRight, ChevronLeft, Flag, MonitorPlay
} from 'lucide-react'
import { Question } from './ExamForm'

interface ExamPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    examTitle: string
    durationMinutes: number
    questions: Question[]
    settings: {
        shuffleQuestions: boolean
        shuffleOptions: boolean
        showResults: boolean
    }
}

export default function ExamPreviewModal({
    isOpen, onClose, examTitle, durationMinutes, questions, settings
}: ExamPreviewModalProps) {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [timeLeft, setTimeLeft] = useState(durationMinutes * 60)
    const [flagged, setFlagged] = useState<Record<string, boolean>>({})
    const [view, setView] = useState<'intro' | 'exam' | 'result'>('intro')

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setView('intro')
            setCurrentQuestionIndex(0)
            setAnswers({})
            setFlagged({})
            setTimeLeft(durationMinutes * 60)
        }
    }, [isOpen, durationMinutes])

    // Timer effect
    useEffect(() => {
        if (!isOpen || view !== 'exam') return
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0) {
                    setView('result')
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [isOpen, view])

    if (!isOpen) return null

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const handleAnswer = (optionId: string) => {
        setAnswers(prev => ({
            ...prev,
            [questions[currentQuestionIndex].id]: optionId
        }))
    }

    // Helper to calculate score for preview result
    const calculateScore = () => {
        let correctCount = 0
        let totalPoints = 0
        let earnedPoints = 0

        questions.forEach(q => {
            totalPoints += q.points
            const selectedOptId = answers[q.id]
            const correctOpt = q.options.find(o => o.is_correct)
            if (correctOpt && selectedOptId === correctOpt.id) {
                correctCount++
                earnedPoints += q.points
            }
        })

        const percent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
        return { percent, correctCount, totalPoints, earnedPoints }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

                {/* Header - Preview Mode Indicator */}
                <div className="bg-gray-900 text-white px-6 py-3 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <MonitorPlay className="w-5 h-5 text-green-400" />
                        <span className="font-semibold tracking-wide">Student Preview Mode</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-gray-50 relative">

                    {/* Intro Screen */}
                    {view === 'intro' && (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto">
                            <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
                                <MonitorPlay className="w-10 h-10 ml-1" />
                            </div>
                            <h2 className="text-3xl font-bold text-gray-900 mb-4">{examTitle || 'Untitled Exam'}</h2>

                            <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8 text-left">
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase font-semibold">Duration</div>
                                        <div className="font-bold text-gray-900">{durationMinutes} mins</div>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-gray-400" />
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase font-semibold">Questions</div>
                                        <div className="font-bold text-gray-900">{questions.length} Questions</div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setView('exam')}
                                className="w-full max-w-md py-4 bg-black text-white text-lg font-bold rounded-xl hover:bg-gray-800 transition-all shadow-lg active:scale-95"
                            >
                                Start Preview Exam
                            </button>
                            <p className="mt-4 text-sm text-gray-500">
                                This is exactly how students will see the exam start screen.
                            </p>
                        </div>
                    )}

                    {/* Exam Interface */}
                    {view === 'exam' && questions.length > 0 && (
                        <div className="min-h-full flex flex-col">
                            {/* Exam Top Bar */}
                            <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
                                <div>
                                    <h3 className="font-bold text-gray-900 max-w-xs truncate">{examTitle}</h3>
                                    <div className="text-xs text-gray-500">Question {currentQuestionIndex + 1} of {questions.length}</div>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg font-mono font-bold text-gray-700">
                                    <Clock className="w-4 h-4" />
                                    {formatTime(timeLeft)}
                                </div>
                            </div>

                            <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
                                {/* Progress Bar */}
                                <div className="w-full h-1.5 bg-gray-200 rounded-full mb-8">
                                    <div
                                        className="h-full bg-blue-600 rounded-full transition-all duration-300"
                                        style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                                    />
                                </div>

                                {/* Question Card */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                                    <div className="p-6 md:p-8">
                                        <div className="flex justify-between items-start gap-4 mb-6">
                                            <h2 className="text-xl font-medium text-gray-900 leading-relaxed">
                                                {questions[currentQuestionIndex].question_text}
                                            </h2>
                                            <button
                                                onClick={() => setFlagged(prev => ({ ...prev, [questions[currentQuestionIndex].id]: !prev[questions[currentQuestionIndex].id] }))}
                                                className={`p-2 rounded-full transition-colors ${flagged[questions[currentQuestionIndex].id] ? 'bg-orange-100 text-orange-600' : 'text-gray-300 hover:bg-gray-50'}`}
                                            >
                                                <Flag className="w-5 h-5" fill={flagged[questions[currentQuestionIndex].id] ? "currentColor" : "none"} />
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {questions[currentQuestionIndex].options.map((opt) => (
                                                <label
                                                    key={opt.id}
                                                    className={`flex items-center w-full p-4 rounded-xl border-2 cursor-pointer transition-all group ${answers[questions[currentQuestionIndex].id] === opt.id
                                                            ? 'border-black bg-gray-50 shadow-sm'
                                                            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    <div className={`w-5 h-5 rounded-full border-2 mr-4 flex items-center justify-center shrink-0 transition-colors ${answers[questions[currentQuestionIndex].id] === opt.id
                                                            ? 'border-black'
                                                            : 'border-gray-300 group-hover:border-gray-400'
                                                        }`}>
                                                        {answers[questions[currentQuestionIndex].id] === opt.id && (
                                                            <div className="w-2.5 h-2.5 rounded-full bg-black" />
                                                        )}
                                                    </div>
                                                    <span className="text-gray-700 font-medium">{opt.option_text}</span>
                                                    <input
                                                        type="radio"
                                                        name={`q-${questions[currentQuestionIndex].id}`}
                                                        className="hidden"
                                                        checked={answers[questions[currentQuestionIndex].id] === opt.id}
                                                        onChange={() => handleAnswer(opt.id)}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Navigation */}
                                <div className="flex justify-between items-center">
                                    <button
                                        onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                                        disabled={currentQuestionIndex === 0}
                                        className="px-6 py-2.5 text-gray-600 font-medium hover:bg-gray-100 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" /> Previous
                                    </button>

                                    {currentQuestionIndex === questions.length - 1 ? (
                                        <button
                                            onClick={() => setView('result')}
                                            className="px-8 py-2.5 bg-black text-white font-bold rounded-xl hover:bg-gray-800 transition-colors shadow-lg"
                                        >
                                            Submit Exam
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
                                            className="px-6 py-2.5 bg-gray-900 text-white font-medium hover:bg-gray-800 rounded-xl flex items-center gap-2 transition-colors"
                                        >
                                            Next <ChevronRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Result Screen */}
                    {view === 'result' && (
                        <div className="h-full flex flex-col items-center justify-center p-8 bg-gray-50">
                            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-100">
                                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle className="w-10 h-10" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Exam Completed!</h2>
                                <p className="text-gray-500 mb-8">This is the completion screen students will see.</p>

                                {settings.showResults && (
                                    <div className="bg-gray-50 rounded-xl p-6 mb-8 border border-gray-200">
                                        <div className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-1">Projected Score</div>
                                        <div className="text-4xl font-extrabold text-gray-900">
                                            {calculateScore().percent}%
                                        </div>
                                        <div className="text-sm text-gray-400 mt-2 font-medium">
                                            {calculateScore().earnedPoints} / {calculateScore().totalPoints} Points
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={onClose}
                                    className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
                                >
                                    Close Preview
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
