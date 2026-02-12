// ============================
// Security & Protection Hook (Enhanced Anti-Cheat v2)
// ============================

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Clock, AlertTriangle, AlertCircle, ShieldAlert } from 'lucide-react'

interface UseExamProtectionProps {
    phase: string
    attemptId: string | null
    timeLeft: number
    onDevToolsDetected: () => void
    onCopyAttempt: (customMessage?: string) => void
    onSuspiciousActivity?: (activity: { type: string; details: string }) => void
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
    onSuspiciousActivity,
    warningShown5min,
    warningShown1min,
    setWarningShown5min,
    setWarningShown1min
}: UseExamProtectionProps) {

    const devToolsCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)

    // ====== TIMER WARNINGS ======
    useEffect(() => {
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

    // ====== PREVENT KEYBOARD SHORTCUTS (Enhanced) ======
    useEffect(() => {
        if (phase !== 'exam') return

        const handleKeyDown = (e: KeyboardEvent) => {
            // F12
            if (e.key === 'F12') {
                e.preventDefault()
                onDevToolsDetected()
                toast.error('Developer tools are disabled during exam')
                return false
            }

            // Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                e.preventDefault()
                onDevToolsDetected()
                toast.error('Developer tools are disabled during exam')
                return false
            }

            // Ctrl+Shift+J (Console)
            if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                e.preventDefault()
                onDevToolsDetected()
                toast.error('Console is disabled during exam')
                return false
            }

            // Ctrl+Shift+C (Inspect)
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault()
                onDevToolsDetected()
                toast.error('Inspect element is disabled during exam')
                return false
            }

            // Ctrl+U (View Source)
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'view_source_attempt', details: 'Ctrl+U (View Source) blocked' })
                return false
            }

            // Ctrl+S (Save)
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'save_attempt', details: 'Ctrl+S (Save Page) blocked' })
                return false
            }

            // ===== NEW: Additional Blocked Shortcuts =====

            // Ctrl+P (Print)
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'print_attempt', details: 'Ctrl+P (Print) blocked' })
                toast.error('Printing is disabled during exam')
                return false
            }

            // Ctrl+A (Select All)
            if (e.ctrlKey && e.key === 'a') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'select_all_attempt', details: 'Ctrl+A (Select All) blocked' })
                toast.error('Select All is disabled during exam')
                return false
            }

            // Ctrl+F (Find)
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'find_attempt', details: 'Ctrl+F (Find in Page) blocked' })
                toast.error('Find is disabled during exam')
                return false
            }

            // Ctrl+G / Ctrl+H (Find Next / Replace - some browsers)
            if (e.ctrlKey && (e.key === 'g' || e.key === 'h')) {
                e.preventDefault()
                return false
            }

            // Ctrl+L (Address bar focus)
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'address_bar_attempt', details: 'Ctrl+L (Address Bar) blocked' })
                return false
            }

            // Ctrl+D (Bookmark)
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault()
                return false
            }

            // Ctrl+J (Downloads - Chrome)
            if (e.ctrlKey && !e.shiftKey && e.key === 'j') {
                e.preventDefault()
                return false
            }

            // PrintScreen / PrtSc
            if (e.key === 'PrintScreen') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'screenshot_attempt', details: 'PrintScreen key blocked' })
                toast.error('Screenshots are disabled during exam. This has been recorded.', { duration: 4000 })
                return false
            }

            // Windows key + Shift + S (Windows Snip)
            if (e.key === 'Meta' || (e.metaKey && e.shiftKey && e.key === 'S')) {
                // Can't fully prevent Windows key, but log it
                onSuspiciousActivity?.({ type: 'snip_tool_attempt', details: 'Win+Shift+S or Meta key detected' })
            }

            // Alt+Tab logging (Alt key detection)
            if (e.altKey && e.key === 'Tab') {
                onSuspiciousActivity?.({ type: 'alt_tab_attempt', details: 'Alt+Tab detected' })
            }

            // Ctrl+W (Close tab)
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault()
                return false
            }

            // Ctrl+N (New Window)
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'new_window_attempt', details: 'Ctrl+N (New Window) blocked' })
                return false
            }

            // Ctrl+T (New Tab)
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault()
                onSuspiciousActivity?.({ type: 'new_tab_attempt', details: 'Ctrl+T (New Tab) blocked' })
                return false
            }

            // Ctrl+Shift+Delete (Clear browsing data)
            if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
                e.preventDefault()
                return false
            }
        }

        document.addEventListener('keydown', handleKeyDown, { capture: true })
        return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }, [phase, onDevToolsDetected, onSuspiciousActivity])

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
            onCopyAttempt('Paste attempt')
            toast.error('Pasting is disabled during exam')
            return false
        }

        const handleCut = (e: ClipboardEvent) => {
            e.preventDefault()
            onCopyAttempt('Cut attempt')
            toast.error('Cutting is disabled during exam')
            return false
        }

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault()
            onCopyAttempt('Right-click attempt')
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

    // ====== PREVENT TEXT SELECTION ======
    useEffect(() => {
        if (phase !== 'exam') return

        const handleSelectStart = (e: Event) => {
            e.preventDefault()
            return false
        }

        const handleDragStart = (e: Event) => {
            e.preventDefault()
            return false
        }

        document.addEventListener('selectstart', handleSelectStart)
        document.addEventListener('dragstart', handleDragStart)

        // Apply no-select class to body
        document.body.classList.add('no-select')

        return () => {
            document.removeEventListener('selectstart', handleSelectStart)
            document.removeEventListener('dragstart', handleDragStart)
            document.body.classList.remove('no-select')
        }
    }, [phase])

    // ====== BLOCK PRINT ======
    useEffect(() => {
        if (phase !== 'exam') return

        const handleBeforePrint = (e: Event) => {
            e.preventDefault()
            onSuspiciousActivity?.({ type: 'print_attempt', details: 'Print dialog blocked' })
            toast.error('Printing is disabled during exam')
        }

        const handleAfterPrint = () => {
            // If print somehow gets through, log it
            onSuspiciousActivity?.({ type: 'print_executed', details: 'Print dialog was opened (possibly bypassed)' })
        }

        window.addEventListener('beforeprint', handleBeforePrint)
        window.addEventListener('afterprint', handleAfterPrint)

        // Inject CSS to hide content when printing
        const style = document.createElement('style')
        style.id = 'exam-print-block'
        style.textContent = '@media print { body { display: none !important; } }'
        document.head.appendChild(style)

        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint)
            window.removeEventListener('afterprint', handleAfterPrint)
            const printStyle = document.getElementById('exam-print-block')
            if (printStyle) printStyle.remove()
        }
    }, [phase, onSuspiciousActivity])

    // ====== ENHANCED DEVTOOLS DETECTION (Continuous) ======
    useEffect(() => {
        if (phase !== 'exam') return

        // Method 1: Size threshold check (continuous)
        const checkDevToolsBySize = () => {
            const threshold = 160
            if (
                window.outerHeight - window.innerHeight > threshold ||
                window.outerWidth - window.innerWidth > threshold
            ) {
                onDevToolsDetected()
            }
        }

        // Method 2: Debugger timing detection
        const checkDevToolsByTiming = () => {
            const start = performance.now()
            // The debugger statement pauses execution if DevTools are open
            // We use Function constructor to avoid static analysis removing it
            try {
                const check = new Function('debugger')
                check()
            } catch { /* ignore */ }
            const duration = performance.now() - start
            if (duration > 100) {
                // debugger statement took too long = DevTools likely open
                onDevToolsDetected()
            }
        }

        // Initial check
        checkDevToolsBySize()

        // Continuous monitoring every 3 seconds
        devToolsCheckIntervalRef.current = setInterval(() => {
            checkDevToolsBySize()
            checkDevToolsByTiming()
        }, 3000)

        // Also check on resize (DevTools open causes resize)
        window.addEventListener('resize', checkDevToolsBySize)

        return () => {
            if (devToolsCheckIntervalRef.current) {
                clearInterval(devToolsCheckIntervalRef.current)
                devToolsCheckIntervalRef.current = null
            }
            window.removeEventListener('resize', checkDevToolsBySize)
        }
    }, [phase, onDevToolsDetected])

    // ====== PREVENT PAGE VISIBILITY TRICKS ======
    useEffect(() => {
        if (phase !== 'exam') return

        // Detect Picture-in-Picture attempts
        const handlePiP = () => {
            onSuspiciousActivity?.({ type: 'pip_attempt', details: 'Picture-in-Picture mode detected' })
        }

        document.addEventListener('enterpictureinpicture', handlePiP)

        return () => {
            document.removeEventListener('enterpictureinpicture', handlePiP)
        }
    }, [phase, onSuspiciousActivity])
}
