import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { setSession } from '@/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Input validation schema
const LoginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(6, 'Password must be at least 6 characters')
})

export async function POST(request: NextRequest) {
    // Use service role to bypass RLS (needed for admin operations)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        const body = await request.json()

        // Validate input
        const validation = LoginSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.issues },
                { status: 400 }
            )
        }

        const { email, password } = validation.data

        // Fetch admin by email only
        const { data: admin, error: adminError } = await supabase
            .from('admins')
            .select('*')
            .eq('email', email.trim())
            .maybeSingle()

        if (adminError) {
            return NextResponse.json(
                { error: 'Database error' },
                { status: 500 }
            )
        }

        if (!admin) {
            // Don't reveal if email exists (security best practice)
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Verify password with bcrypt
        const isValidPassword = await bcrypt.compare(password, admin.password_hash)

        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Return admin data (without password hash)
        const { password_hash, ...adminData } = admin

        // Set secure session cookie
        await setSession(adminData)

        return NextResponse.json({
            success: true,
            admin: adminData
        })

    } catch (error) {
        // console.error('Login API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
