'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email.trim()) {
            toast.error('Please enter your email')
            return
        }

        setLoading(true)

        try {
            const response = await fetch('/api/admin/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })

            const data = await response.json()

            if (response.ok) {
                setSent(true)
                toast.success('Reset link sent! Check your email.')
            } else {
                const errorData = data as { error?: string; rateLimited?: boolean; waitMinutes?: number }

                if (errorData.rateLimited && errorData.waitMinutes) {
                    toast.error(
                        `Please wait ${errorData.waitMinutes} minute${errorData.waitMinutes > 1 ? 's' : ''} before requesting another reset link`,
                        { duration: 5000 }
                    )
                } else {
                    toast.error(errorData.error || 'Failed to send reset link')
                }
            }
        } catch (error) {
            toast.error('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    if (sent) {
        return (
            <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center p-6">
                {/* Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

                {/* Gradient Orbs */}
                <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
                <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
                <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />

                <div className="w-full max-w-[440px] relative z-10">
                    <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200/60 shadow-2xl shadow-black/10 text-center">
                        <div className="inline-flex items-center gap-3 mb-8">
                            <div className="w-11 h-11 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl flex items-center justify-center shadow-lg shadow-black/10">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                    <path d="M2 17l10 5 10-5" />
                                    <path d="M2 12l10 5 10-5" />
                                </svg>
                            </div>
                            <span className="text-sm font-semibold text-gray-900">Exam System</span>
                        </div>
                        <h2 className="text-[32px] font-bold text-gray-900 tracking-tight leading-tight mb-3">
                            Check your email
                        </h2>
                        <p className="text-gray-500 text-[15px] leading-relaxed mb-8">
                            If an account exists for <span className="font-semibold text-gray-700">{email}</span>, you will receive a password reset link shortly.
                        </p>

                        <Link
                            href="/admin/login"
                            className="inline-block text-[13px] text-gray-600 hover:text-gray-900 transition-colors font-medium"
                        >
                            Back to sign in
                        </Link>
                    </div>
                </div>

                <style jsx>{`
                    @keyframes blob {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-20px); }
                    }
                    .animate-blob {
                        animation: blob 7s infinite;
                    }
                    .animation-delay-2000 {
                        animation-delay: 2s;
                    }
                    .animation-delay-4000 {
                        animation-delay: 4s;
                    }
                `}</style>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white relative overflow-hidden flex items-center justify-center p-6">
            {/* Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

            {/* Gradient Orbs */}
            <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
            <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />

            <div className="w-full max-w-[440px] relative z-10">
                {/* Logo & Header */}
                <div className="mb-14">
                    <div className="inline-flex items-center gap-3 mb-10">
                        <div className="w-11 h-11 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl flex items-center justify-center shadow-lg shadow-black/10">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">Exam System</span>
                    </div>
                    <h1 className="text-[32px] font-bold text-gray-900 tracking-tight leading-tight mb-3">
                        Reset password
                    </h1>
                    <p className="text-gray-500 text-[15px] leading-relaxed">
                        Enter your email and we'll send you a reset link
                    </p>
                </div>

                {/* Form Card */}
                <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-8 border border-gray-200/60 shadow-2xl shadow-black/10">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-[13px] font-semibold text-gray-700">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 hover:border-gray-400"
                                placeholder="you@example.com"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gray-900 text-white py-3 px-4 rounded-xl font-semibold text-[15px] hover:bg-gray-800 active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 shadow-lg shadow-gray-900/10 hover:shadow-xl hover:shadow-gray-900/20 mt-8"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Please wait...
                                </span>
                            ) : 'Send reset link'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <Link
                            href="/admin/login"
                            className="text-[13px] text-gray-600 hover:text-gray-900 transition-colors font-medium"
                        >
                            Back to sign in
                        </Link>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes blob {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
            `}</style>
        </div>
    )
}
