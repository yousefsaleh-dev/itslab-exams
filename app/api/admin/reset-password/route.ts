import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ResetPasswordSchema = z.object({
    token: z.string().min(1, 'Token required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters')
})

export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })

    try {
        const body = await request.json()

        // Validate input
        const validation = ResetPasswordSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.issues },
                { status: 400 }
            )
        }

        const { token, newPassword } = validation.data

        // Find valid token
        const { data: resetToken, error: tokenError } = await supabase
            .from('password_reset_tokens')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle()

        if (tokenError || !resetToken) {
            return NextResponse.json(
                { error: 'Invalid or expired reset token' },
                { status: 400 }
            )
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10)

        // Update admin password
        const { error: updateError } = await supabase
            .from('admins')
            .update({ password_hash: newPasswordHash })
            .eq('id', resetToken.admin_id)

        if (updateError) {
            return NextResponse.json(
                { error: 'Failed to update password' },
                { status: 500 }
            )
        }

        // Mark token as used
        await supabase
            .from('password_reset_tokens')
            .update({ used: true })
            .eq('id', resetToken.id)

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully'
        })

    } catch (error) {
        // console.error('Reset password API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
