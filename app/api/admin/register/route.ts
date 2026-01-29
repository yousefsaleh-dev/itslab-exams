import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { setSession } from '@/lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// IMPORTANT: This should be a strong secret, NOT exposed to client
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY!

// Input validation schema
const RegisterSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    secretKey: z.string().min(1, 'Secret key required')
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
        const validation = RegisterSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.issues },
                { status: 400 }
            )
        }

        const { name, email, password, secretKey } = validation.data

        // Debug logging (REMOVE in production!)
        if (process.env.NODE_ENV === 'development') {
            // console.log('=== SECRET KEY CHECK ===')
            // console.log('Expected:', ADMIN_SECRET_KEY)
            // console.log('Received:', secretKey)
            // console.log('Match:', secretKey === ADMIN_SECRET_KEY)
        }

        // SERVER-SIDE secret key validation (secure!)
        if (secretKey !== ADMIN_SECRET_KEY) {
            return NextResponse.json(
                { error: 'Invalid secret key' },
                { status: 403 }
            )
        }

        // Check if email already exists
        const { data: existing } = await supabase
            .from('admins')
            .select('id')
            .eq('email', email)
            .maybeSingle()

        if (existing) {
            return NextResponse.json(
                { error: 'Email already registered' },
                { status: 409 }
            )
        }

        // Hash password with bcrypt (10 rounds)
        const passwordHash = await bcrypt.hash(password, 10)

        // Create admin
        const { data: newAdmin, error: insertError } = await supabase
            .from('admins')
            .insert([{
                name: name.trim(),
                email: email.trim(),
                password_hash: passwordHash
            }])
            .select()
            .maybeSingle()

        if (insertError) {
            // console.error('=== INSERT ERROR ===', insertError)
            return NextResponse.json(
                { error: 'Failed to create admin account', details: insertError.message },
                { status: 500 }
            )
        }

        if (!newAdmin) {
            return NextResponse.json(
                { error: 'No data returned after registration' },
                { status: 500 }
            )
        }

        // Return admin data (without password hash)
        const { password_hash, ...adminData } = newAdmin

        // Set secure session cookie
        await setSession(adminData)

        return NextResponse.json({
            success: true,
            admin: adminData
        })

    } catch (error) {
        // console.error('=== REGISTER API ERROR ===', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
