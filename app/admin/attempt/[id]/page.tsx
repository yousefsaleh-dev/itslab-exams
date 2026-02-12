'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle, User, Trophy, LogOut, Shield, Clipboard, DoorOpen, Eye, RotateCcw, ArrowRightLeft, Printer, Camera, Scissors, FileText, Save, Search, MousePointerClick, Link2, AppWindow, FileStack, Keyboard, MonitorPlay, CircleDot, ShieldCheck, Globe, Monitor } from 'lucide-react'
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
    ip_address: string | null
    user_agent: string | null
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

// ====== CHEATING RISK SCORE CALCULATOR ======
function getCheatingRiskScore(attempt: AttemptDetails): { score: number; level: 'low' | 'medium' | 'high'; color: string; bgColor: string; label: string } {
    let riskPoints = 0

    // Exit count scoring
    riskPoints += (attempt.exit_count || 0) * 15

    // Window switches scoring
    riskPoints += (attempt.window_switches || 0) * 5

    // Suspicious activities scoring
    const activities = attempt.suspicious_activities || []
    const devtoolsCount = activities.filter((a: any) => a.type === 'devtools_detected').length
    const copyCount = activities.filter((a: any) => a.type === 'copy_attempt').length
    const screenshotCount = activities.filter((a: any) => a.type === 'screenshot_attempt').length
    const printCount = activities.filter((a: any) => a.type === 'print_attempt' || a.type === 'print_executed').length
    const blurCount = activities.filter((a: any) => a.type === 'window_blur').length
    const longAbsences = activities.filter((a: any) => {
        if (a.type !== 'window_focus_return') return false
        const match = a.details?.match(/(\d+)s away/)
        return match && parseInt(match[1]) > 10
    }).length

    riskPoints += devtoolsCount * 30
    riskPoints += copyCount * 10
    riskPoints += screenshotCount * 25
    riskPoints += printCount * 20
    riskPoints += longAbsences * 15

    // Cap at 100
    const score = Math.min(100, riskPoints)

    if (score >= 50) return { score, level: 'high', color: 'text-red-700', bgColor: 'bg-red-100 border-red-200', label: '🔴 High Risk' }
    if (score >= 20) return { score, level: 'medium', color: 'text-yellow-700', bgColor: 'bg-yellow-100 border-yellow-200', label: '🟡 Medium Risk' }
    return { score, level: 'low', color: 'text-green-700', bgColor: 'bg-green-100 border-green-200', label: '🟢 Low Risk' }
}

// ====== ACTIVITY TYPE DISPLAY HELPERS ======
function getActivityIcon(type: string): React.ReactNode {
    const iconClass = 'w-4 h-4'
    const icons: Record<string, React.ReactNode> = {
        'devtools_detected': <Shield className={iconClass} />,
        'copy_attempt': <Clipboard className={iconClass} />,
        'fullscreen_exit': <DoorOpen className={iconClass} />,
        'window_blur': <Eye className={iconClass} />,
        'window_focus_return': <RotateCcw className={iconClass} />,
        'tab_hidden': <ArrowRightLeft className={iconClass} />,
        'tab_visible': <CheckCircle2 className={iconClass} />,
        'print_attempt': <Printer className={iconClass} />,
        'print_executed': <Printer className={iconClass} />,
        'screenshot_attempt': <Camera className={iconClass} />,
        'snip_tool_attempt': <Scissors className={iconClass} />,
        'view_source_attempt': <FileText className={iconClass} />,
        'save_attempt': <Save className={iconClass} />,
        'find_attempt': <Search className={iconClass} />,
        'select_all_attempt': <MousePointerClick className={iconClass} />,
        'address_bar_attempt': <Link2 className={iconClass} />,
        'new_window_attempt': <AppWindow className={iconClass} />,
        'new_tab_attempt': <FileStack className={iconClass} />,
        'alt_tab_attempt': <Keyboard className={iconClass} />,
        'pip_attempt': <MonitorPlay className={iconClass} />,
        'exam_started': <CircleDot className={iconClass} />,
    }
    return icons[type] || <AlertTriangle className={iconClass} />
}

function getActivityLabel(type: string): string {
    const labels: Record<string, string> = {
        'devtools_detected': 'DevTools Detected',
        'copy_attempt': 'Copy/Paste/Right-Click',
        'fullscreen_exit': 'Fullscreen Exit',
        'window_blur': 'Window Focus Lost',
        'window_focus_return': 'Returned to Exam',
        'tab_hidden': 'Tab Switched Away',
        'tab_visible': 'Tab Returned',
        'print_attempt': 'Print Attempt',
        'print_executed': 'Print Executed',
        'screenshot_attempt': 'Screenshot Attempt',
        'snip_tool_attempt': 'Snip Tool Attempt',
        'view_source_attempt': 'View Source Attempt',
        'save_attempt': 'Save Page Attempt',
        'find_attempt': 'Find in Page Attempt',
        'select_all_attempt': 'Select All Attempt',
        'address_bar_attempt': 'Address Bar Access',
        'new_window_attempt': 'New Window Attempt',
        'new_tab_attempt': 'New Tab Attempt',
        'alt_tab_attempt': 'Alt+Tab Detected',
        'pip_attempt': 'Picture-in-Picture',
        'exam_started': 'Exam Started',
    }
    return labels[type] || type
}

function getActivitySeverityColor(type: string): { bg: string; border: string; text: string } {
    const critical = { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' }
    const warning = { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900' }
    const info = { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' }
    const safe = { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900' }

    const severities: Record<string, typeof critical> = {
        'devtools_detected': critical,
        'screenshot_attempt': critical,
        'print_attempt': critical,
        'print_executed': critical,
        'fullscreen_exit': critical,
        'copy_attempt': warning,
        'window_blur': warning,
        'tab_hidden': warning,
        'snip_tool_attempt': warning,
        'view_source_attempt': warning,
        'new_window_attempt': warning,
        'new_tab_attempt': warning,
        'alt_tab_attempt': warning,
        'address_bar_attempt': info,
        'find_attempt': info,
        'select_all_attempt': info,
        'save_attempt': info,
        'pip_attempt': info,
        'window_focus_return': safe,
        'tab_visible': safe,
        'exam_started': safe,
    }
    return severities[type] || warning
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
            const response = await fetch(`/api/admin/attempt/${params.id}/details?adminId=${admin?.id}`)
            const data = await response.json()

            if (!data.success) {
                throw new Error(data.error || 'Failed to load attempt details')
            }

            setAttempt(data.attempt)
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
    const risk = getCheatingRiskScore(attempt)

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

                    {/* Cheating Risk Score */}
                    <div className={`mt-4 p-4 rounded-lg border ${risk.bgColor}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <span className={`text-lg font-bold ${risk.color}`}>{risk.label}</span>
                                <span className="text-sm text-gray-500 ml-2">Risk Score: {risk.score}/100</span>
                            </div>
                            <div className="w-32 bg-gray-200 rounded-full h-3">
                                <div
                                    className={`h-3 rounded-full transition-all ${risk.level === 'high' ? 'bg-red-500' :
                                        risk.level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                                        }`}
                                    style={{ width: `${risk.score}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* IP / Device Info */}
                    {(attempt.ip_address || attempt.user_agent) && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                            <div className="flex flex-wrap gap-4">
                                {attempt.ip_address && (
                                    <div className="flex items-center gap-2">
                                        <Globe className="w-4 h-4 text-gray-400" />
                                        <span className="font-medium text-gray-600">IP:</span>
                                        <span className="font-mono text-gray-900">
                                            {attempt.ip_address === '::1' || attempt.ip_address === '127.0.0.1' ? 'Local Network' : attempt.ip_address}
                                        </span>
                                    </div>
                                )}
                                {attempt.user_agent && (() => {
                                    const ua = attempt.user_agent
                                    let browser = 'Unknown Browser'
                                    let os = 'Unknown OS'
                                    if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome'
                                    else if (ua.includes('Edg')) browser = 'Edge'
                                    else if (ua.includes('Firefox')) browser = 'Firefox'
                                    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari'
                                    if (ua.includes('Windows')) os = 'Windows'
                                    else if (ua.includes('Mac OS')) os = 'macOS'
                                    else if (ua.includes('Android')) os = 'Android'
                                    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
                                    else if (ua.includes('Linux')) os = 'Linux'
                                    return (
                                        <div className="flex items-center gap-2">
                                            <Monitor className="w-4 h-4 text-gray-400" />
                                            <span className="font-medium text-gray-600">Device:</span>
                                            <span className="text-gray-900">{browser} • {os}</span>
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Violations Timeline */}
                {(attempt.exit_count > 0 || (attempt.window_switches && attempt.window_switches > 0) || (attempt.suspicious_activities && attempt.suspicious_activities.length > 0)) && (() => {
                    // Separate info events from actual violations
                    const nonViolationTypes = new Set(['exam_started', 'tab_visible', 'window_focus_return'])
                    const allActivities = attempt.suspicious_activities || []
                    const violations = allActivities.filter((a: any) => !nonViolationTypes.has(a.type))

                    // Group rapid duplicate events (same type within 10 seconds)
                    const grouped: Array<{ type: string; details: string; timestamp: string; count: number }> = []
                    for (const activity of violations) {
                        const last = grouped[grouped.length - 1]
                        if (last && last.type === activity.type) {
                            const timeDiff = activity.timestamp && last.timestamp
                                ? Math.abs(new Date(activity.timestamp).getTime() - new Date(last.timestamp).getTime())
                                : Infinity
                            if (timeDiff < 10000) {
                                last.count++
                                continue
                            }
                        }
                        grouped.push({ ...activity, count: 1 })
                    }

                    return (
                        <div className="bg-white rounded-xl border border-red-200 p-6 mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                <h2 className="text-xl font-semibold text-gray-900">Security Violations Timeline</h2>
                                <span className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                                    {violations.length} violations
                                </span>
                            </div>

                            <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                {/* Grouped violation log */}
                                {grouped.map((activity: any, idx: number) => {
                                    const severity = getActivitySeverityColor(activity.type)
                                    return (
                                        <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border ${severity.bg} ${severity.border}`}>
                                            <div className="flex-shrink-0 mt-0.5">
                                                <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
                                                    <span className="text-sm">{getActivityIcon(activity.type)}</span>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`font-semibold ${severity.text}`}>
                                                        {getActivityLabel(activity.type)}
                                                    </span>
                                                    {activity.count > 1 && (
                                                        <span className="px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs font-bold">
                                                            ×{activity.count}
                                                        </span>
                                                    )}
                                                    {activity.timestamp && (
                                                        <span className="text-xs text-gray-500 font-mono">
                                                            {new Date(activity.timestamp).toLocaleTimeString()}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600 mt-0.5">{activity.details}</p>
                                            </div>
                                        </div>
                                    )
                                })}

                                {/* Fallback: show generic items if no detailed log */}
                                {(!attempt.suspicious_activities || attempt.suspicious_activities.length === 0) && (
                                    <>
                                        {Array.from({ length: attempt.exit_count }).map((_, i) => (
                                            <div key={`exit-${i}`} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                                                <div className="flex-shrink-0 mt-0.5">
                                                    <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center">
                                                        <AlertTriangle className="w-4 h-4 text-red-700" />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-semibold text-red-900">Fullscreen Exit Detected</span>
                                                    <p className="text-sm text-red-700 mt-0.5">Student exited fullscreen mode</p>
                                                </div>
                                            </div>
                                        ))}
                                        {Array.from({ length: attempt.window_switches || 0 }).map((_, i) => (
                                            <div key={`switch-${i}`} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                                                <div className="flex-shrink-0 mt-0.5">
                                                    <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center">
                                                        <LogOut className="w-4 h-4 text-orange-700" />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-semibold text-orange-900">Window Switch / Focus Lost</span>
                                                    <p className="text-sm text-orange-700 mt-0.5">Student switched tabs or windows</p>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })()}

                {/* Clean Session - No Violations */}
                {attempt.exit_count === 0 && (!attempt.window_switches || attempt.window_switches === 0) && (!attempt.suspicious_activities || attempt.suspicious_activities.length === 0) && (
                    <div className="bg-white rounded-xl border border-green-200 p-6 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                                <ShieldCheck className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-green-800">No Violations Detected</h2>
                                <p className="text-sm text-green-600">This student completed the exam without any suspicious activity.</p>
                            </div>
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
