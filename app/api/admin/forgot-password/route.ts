import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ForgotPasswordSchema = z.object({
    email: z.string().email('Invalid email format')
})

export async function POST(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })

    try {
        const body = await request.json()

        // Validate input
        const validation = ForgotPasswordSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            )
        }

        const { email } = validation.data

        // Check if admin exists (don't reveal if email doesn't exist - security!)
        const { data: admin } = await supabase
            .from('admins')
            .select('id, email, name')
            .eq('email', email.trim())
            .maybeSingle()

        if (!admin) {
            // Don't reveal if email exists (security best practice)
            return NextResponse.json({
                success: true,
                message: 'If your email exists, you will receive a reset link'
            })
        }

        // RATE LIMITING: Check for recent tokens (prevent abuse)
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

        const { data: recentTokens } = await supabase
            .from('password_reset_tokens')
            .select('created_at')
            .eq('admin_id', admin.id)
            .gte('created_at', fifteenMinutesAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)

        if (recentTokens && recentTokens.length > 0) {
            // Calculate time remaining
            const lastTokenTime = new Date(recentTokens[0].created_at).getTime()
            const timeSinceLastToken = Date.now() - lastTokenTime
            const waitTimeMs = (15 * 60 * 1000) - timeSinceLastToken
            const waitMinutes = Math.ceil(waitTimeMs / 60000)

            return NextResponse.json({
                success: false,
                error: 'Please wait before requesting another reset link',
                rateLimited: true,
                waitMinutes
            }, { status: 429 })
        }

        // Generate secure random token
        const resetToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

        // Delete any existing unused tokens for this admin
        await supabase
            .from('password_reset_tokens')
            .delete()
            .eq('admin_id', admin.id)
            .eq('used', false)

        // Store reset token
        const { error: tokenError } = await supabase
            .from('password_reset_tokens')
            .insert({
                admin_id: admin.id,
                token: resetToken,
                expires_at: expiresAt.toISOString()
            })

        if (tokenError) {
            // console.error('Token creation error:', tokenError)
            return NextResponse.json(
                { error: 'Failed to create reset token' },
                { status: 500 }
            )
        }

        // Generate reset link
        const resetLink = `${request.nextUrl.origin}/admin/reset-password?token=${resetToken}`

        // Send email via Resend (if API key exists)
        if (process.env.RESEND_API_KEY) {
            try {
                const { Resend } = require('resend')
                const resend = new Resend(process.env.RESEND_API_KEY)

                await resend.emails.send({
                    from: process.env.EMAIL_FROM || 'noreply@exams.itslab.online',
                    to: admin.email,
                    subject: 'Reset your password',
                    html: `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        </head>
                        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #fafafa;">
                            
                            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fafafa; padding: 60px 20px;">
                                <tr>
                                    <td align="center">
                                        
                                        <!-- Email Container -->
                                        <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border: 1px solid #e5e5e5;">
                                            
                                            <!-- Header -->
                                            <tr>
                                                <td style="padding: 48px 48px 32px;">
                                                    <h1 style="margin: 0; font-size: 14px; font-weight: 500; color: #171717; letter-spacing: -0.01em;">
                                                        Exam System
                                                    </h1>
                                                </td>
                                            </tr>
                                            
                                            <!-- Content -->
                                            <tr>
                                                <td style="padding: 0 48px 48px;">
                                                    
                                                    <h2 style="margin: 0 0 24px; font-size: 24px; font-weight: 600; color: #171717; line-height: 1.3; letter-spacing: -0.02em;">
                                                        Reset your password
                                                    </h2>
                                                    
                                                    <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #525252;">
                                                        Hi ${admin.name}, we received a request to reset your password. Click the button below to choose a new password.
                                                    </p>
                                                    
                                                    <!-- Button -->
                                                    <table cellpadding="0" cellspacing="0" style="margin: 0 0 32px;">
                                                        <tr>
                                                            <td style="background-color: #171717; border-radius: 6px;">
                                                                <a href="${resetLink}" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 500;">
                                                                    Reset password
                                                                </a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                    
                                                    <!-- Alternative -->
                                                    <p style="margin: 0 0 8px; font-size: 13px; color: #737373;">
                                                        Or copy and paste this link:
                                                    </p>
                                                    
                                                    <p style="margin: 0 0 32px; font-size: 13px; color: #3b82f6; word-break: break-all;">
                                                        ${resetLink}
                                                    </p>
                                                    
                                                    <!-- Divider -->
                                                    <div style="height: 1px; background-color: #e5e5e5; margin: 32px 0;"></div>
                                                    
                                                    <!-- Info -->
                                                    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #525252;">
                                                        This link will expire in <strong style="color: #171717;">1 hour</strong>.
                                                    </p>
                                                    
                                                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #737373;">
                                                        If you didn't request this, you can safely ignore this email.
                                                    </p>
                                                    
                                                </td>
                                            </tr>
                                            
                                            <!-- Footer -->
                                            <tr>
                                                <td style="padding: 32px 48px; border-top: 1px solid #e5e5e5;">
                                                    <p style="margin: 0; font-size: 12px; color: #a3a3a3; line-height: 1.5;">
                                                        © ${new Date().getFullYear()} Exam System<br>
                                                        This is an automated message, please do not reply.
                                                    </p>
                                                </td>
                                            </tr>
                                            
                                        </table>
                                        
                                    </td>
                                </tr>
                            </table>
                            
                        </body>
                        </html>
                    `
                })

                // console.log('✅ Password reset email sent to:', admin.email)
            } catch (emailError) {
                // console.error('❌ Email send failed:', emailError)
                // Don't fail the request - token is still created
            }
        }

        // Also log link in development for convenience
        // if (process.env.NODE_ENV !== 'production') {
        //     console.log('===================')
        //     console.log('PASSWORD RESET LINK')
        //     console.log('===================')
        //     console.log(`Email: ${admin.email}`)
        //     console.log(`Link: ${resetLink}`)
        //     console.log(`Expires: ${expiresAt}`)
        //     console.log('===================')
        // }

        return NextResponse.json({
            success: true,
            message: 'If your email exists, you will receive a reset link',
            // DEVELOPMENT ONLY - remove in production:
            ...(process.env.NODE_ENV !== 'production' && { resetLink })
        })

    } catch (error) {
        // console.error('Forgot password API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
