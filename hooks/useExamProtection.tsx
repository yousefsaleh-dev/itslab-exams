// ============================
// Security & Protection Hook
// ============================
// Place this in a new file: hooks/useExamProtection.ts

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Clock, AlertTriangle, AlertCircle, ShieldAlert } from 'lucide-react'

interface UseExamProtectionProps {
    phase: string
    attemptId: string | null
    timeLeft: number
    onDevToolsDetected: () => void
    onCopyAttempt: (customMessage?: string) => void
    warningShown5min: boolean
    warningShown1min: boolean
    setWarningShown5min: (shown: boolean) => void
    setWarningShown1min: (shown: boolean) => void
}

export function useExamProtection({
    phase,
    attemptId,
    timeLeft,
    onDevToolsDetected,
    onCopyAttempt,
    warningShown5min,
    warningShown1min,
    setWarningShown5min,
    setWarningShown1min
}: UseExamProtectionProps) {

    // ====== TIMER WARNINGS ======
    useEffect(() => {
        // console.log('🔍 useExamProtection - phase:', phase, 'attemptId:', attemptId)
        if (phase !== 'exam') return

        // 5 minutes warning
        if (timeLeft === 300 && !warningShown5min) {
            toast(<div className="flex items-center gap-2" >
                <Clock className="w-5 h-5" />
                <span>5 minutes remaining </span>
            </div>, { duration: 5000, icon: null })
            setWarningShown5min(true)
        }

        // 1 minute warning
        if (timeLeft === 60 && !warningShown1min) {
            toast(<div className="flex items-center gap-2" >
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="font-semibold" > 1 minute remaining! </span>
            </div>, { duration: 5000, icon: null })
            setWarningShown1min(true)
        }

        // 30 seconds warning
        if (timeLeft === 30) {
            toast(<div className="flex items-center gap-2" >
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="font-bold text-red-600" > 30 seconds left! </span>
            </div>, { duration: 5000, icon: null })
        }
    }, [timeLeft, phase, warningShown5min, warningShown1min])

    // ====== PREVENT KEYBOARD SHORTCUTS ======
    useEffect(() => {
        if (phase !== 'exam') return

        const handleKeyDown = (e: KeyboardEvent) => {
            // F12
            if (e.key === 'F12') {
                e.preventDefault()
                onDevToolsDetected() // Log the attempt
                toast.error('Developer tools are disabled during exam')
                return false
            }

            // Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                e.preventDefault()
                onDevToolsDetected() // Log the attempt
                toast.error('Developer tools are disabled during exam')
                return false
            }

            // Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                e.preventDefault()
                onDevToolsDetected() // Log the attempt
                toast.error('Console is disabled during exam')
                return false
            }

            // Ctrl+Shift+C (Inspect)
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault()
                onDevToolsDetected() // Log the attempt
                toast.error('Inspect element is disabled during exam')
                return false
            }

            // Ctrl+U (View Source)
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault()
                return false
            }

            // Ctrl+S (Save)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault()
                return false
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [phase, onDevToolsDetected])

    // ====== PREVENT COPY/PASTE/RIGHT-CLICK ======
    useEffect(() => {
        if (phase !== 'exam') return

        const handleCopy = (e: ClipboardEvent) => {
            e.preventDefault()
            onCopyAttempt()
            toast.error('Copying is disabled during exam. This attempt has been recorded.')
            return false
        }

        const handlePaste = (e: ClipboardEvent) => {
            e.preventDefault()
            toast.error('Pasting is disabled during exam')
            return false
        }

        const handleCut = (e: ClipboardEvent) => {
            e.preventDefault()
            toast.error('Cutting is disabled during exam')
            return false
        }

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault()
            onCopyAttempt('Right-click attempt') // Log as copy attempt with custom message
            toast.error('Right-click is disabled during exam')
            return false
        }

        document.addEventListener('copy', handleCopy)
        document.addEventListener('paste', handlePaste)
        document.addEventListener('cut', handleCut)
        document.addEventListener('contextmenu', handleContextMenu)

        return () => {
            document.removeEventListener('copy', handleCopy)
            document.removeEventListener('paste', handlePaste)
            document.removeEventListener('cut', handleCut)
            document.removeEventListener('contextmenu', handleContextMenu)
        }
    }, [phase, onCopyAttempt])

    // ====== CHECK DEVTOOLS ON EXAM START ======
    useEffect(() => {
        if (phase === 'exam') {
            // Check if DevTools are already open when exam starts
            const threshold = 160
            if (
                window.outerHeight - window.innerHeight > threshold ||
                window.outerWidth - window.innerWidth > threshold
            ) {
                onDevToolsDetected()
                toast.error('Please close Developer Tools before starting the exam!', {
                    duration: 10000,
                    icon: <ShieldAlert className="w-5 h-5 text-red-500" />
                })
            }
        }
    }, [phase, onDevToolsDetected])
}
