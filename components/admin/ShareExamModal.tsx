import { Copy, Check, MessageCircle, X, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'

interface ShareExamModalProps {
    isOpen: boolean
    onClose: () => void
    examData: {
        id: string
        title: string
        duration: number
        questionsCount: number
        accessCode?: string | null
    }
}

export default function ShareExamModal({ isOpen, onClose, examData }: ShareExamModalProps) {
    const [copiedLink, setCopiedLink] = useState(false)
    const [copiedInfo, setCopiedInfo] = useState(false)

    if (!isOpen) return null

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    // Add access code param if exists to auto-fill for student
    const examLink = `${baseUrl}/exam/${examData.id}${examData.accessCode ? `?code=${examData.accessCode}` : ''}`

    // Format text for WhatsApp
    const shareText = `*New Exam: ${examData.title}*

⏳ Duration: ${examData.duration} mins
❓ Questions: ${examData.questionsCount}

🔗 Link: ${examLink}
${examData.accessCode ? `🔑 Access Code: ${examData.accessCode}` : ''}

Good luck! 🚀`

    const handleCopyLink = () => {
        navigator.clipboard.writeText(examLink)
        setCopiedLink(true)
        toast.success('Link copied!')
        setTimeout(() => setCopiedLink(false), 2000)
    }

    const handleCopyInfo = () => {
        navigator.clipboard.writeText(shareText)
        setCopiedInfo(true)
        toast.success('Exam details copied!')
        setTimeout(() => setCopiedInfo(false), 2000)
    }

    const handleWhatsAppShare = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`
        window.open(url, '_blank')
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden transform transition-all">
                {/* Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900">Share Exam</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Share Link Section */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Exam Link</label>
                        <div className="flex gap-2">
                            <input
                                readOnly
                                value={examLink}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 font-mono focus:outline-none"
                            />
                            <button
                                onClick={handleCopyLink}
                                className={`p-2 rounded-lg border transition-all ${copiedLink ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                {copiedLink ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    {/* Access Code Section (if applicable) */}
                    {examData.accessCode && (
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-semibold text-orange-600 uppercase tracking-wider block mb-1">Access Code</span>
                                    <span className="text-lg font-bold text-gray-900 font-mono tracking-widest">{examData.accessCode}</span>
                                </div>
                                <div className="h-8 w-8 bg-orange-100 rounded-full flex items-center justify-center">
                                    <div className="w-2 h-2 bg-orange-400 rounded-full" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleWhatsAppShare}
                            className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 px-4 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                        >
                            <MessageCircle className="w-5 h-5" />
                            WhatsApp
                        </button>
                        <button
                            onClick={handleCopyInfo}
                            className="flex items-center justify-center gap-2 bg-black hover:bg-gray-800 text-white py-3 px-4 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                        >
                            {copiedInfo ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                            Copy Details
                        </button>
                    </div>

                </div>

                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-400">
                        Students can access the exam immediately through the link.
                    </p>
                </div>
            </div>
        </div>
    )
}
