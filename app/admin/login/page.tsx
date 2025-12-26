'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { LogIn, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AdminLoginPage() {
    const [isLogin, setIsLogin] = useState(true)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [secretKey, setSecretKey] = useState('')
    const [loading, setLoading] = useState(false)

    const router = useRouter()
    const setAdmin = useAuthStore((state) => state.setAdmin)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()

        console.log('=== LOGIN ATTEMPT ===', { email, passwordLength: password.length })

        if (!email.trim() || !password.trim()) {
            toast.error('Please enter email and password')
            return
        }

        setLoading(true)

        try {
            // Simple password hashing (in production, use bcrypt on backend)
            // Use Unicode-safe encoding instead of btoa()
            const passwordHash = Buffer.from(password, 'utf-8').toString('base64')

            const { data, error } = await supabase
                .from('admins')
                .select('*')
                .eq('email', email.trim())
                .eq('password_hash', passwordHash)
                .maybeSingle()

            console.log('Supabase response:', { data, error })

            if (error) {
                console.error('Login error:', error)
                toast.error('An error occurred during login')
                return
            }

            if (!data) {
                console.log('No user found with these credentials')
                toast.error('Invalid email or password')
                return
            }

            console.log('Login successful, setting admin:', data)
            setAdmin(data)
            toast.success('Login successful!')
            router.push('/admin/dashboard')
        } catch (error) {
            console.error('Login exception:', error)
            toast.error('Login failed')
        } finally {
            setLoading(false)
        }
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim() || !email.trim() || !password.trim()) {
            toast.error('Please fill in all fields')
            return
        }

        const adminSecretKey = process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY || process.env.ADMIN_SECRET_KEY

        if (secretKey !== adminSecretKey) {
            toast.error('Invalid secret key')
            return
        }

        setLoading(true)

        try {
            // Use Unicode-safe encoding
            const passwordHash = Buffer.from(password, 'utf-8').toString('base64')

            const { data, error } = await supabase
                .from('admins')
                .insert([
                    {
                        email: email.trim(),
                        password_hash: passwordHash,
                        name: name.trim(),
                    },
                ])
                .select()
                .maybeSingle()

            if (error) {
                console.error('Registration error:', error)
                if (error.code === '23505') {
                    toast.error('Email already registered')
                } else {
                    toast.error(`Registration failed: ${error.message}`)
                }
                return
            }

            if (!data) {
                toast.error('Registration failed - no data returned')
                return
            }

            setAdmin(data)
            toast.success('Registration successful!')
            router.push('/admin/dashboard')
        } catch (error) {
            console.error('Registration exception:', error)
            toast.error('Registration failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {isLogin ? 'Admin Login' : 'Admin Registration'}
                    </h1>
                    <p className="text-gray-600">
                        {isLogin ? 'Sign in to manage exams' : 'Create your admin account'}
                    </p>
                </div>

                <form onSubmit={isLogin ? handleLogin : handleRegister} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter your name"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="admin@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter password"
                        />
                    </div>

                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Secret Registration Key
                            </label>
                            <input
                                type="password"
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                required
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter secret key"
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            'Loading...'
                        ) : isLogin ? (
                            <>
                                <LogIn className="w-5 h-5" />
                                Sign In
                            </>
                        ) : (
                            <>
                                <UserPlus className="w-5 h-5" />
                                Register
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                        {isLogin
                            ? "Don't have an account? Register"
                            : 'Already have an account? Login'}
                    </button>
                </div>
            </div>
        </div>
    )
}