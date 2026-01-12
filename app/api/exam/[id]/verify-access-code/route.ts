import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface VerifyAccessCodeRequest {
    accessCode: string
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    try {
        const { id: examId } = await params
        const body: VerifyAccessCodeRequest = await request.json()

        if (!body.accessCode) {
            return NextResponse.json(
                { error: 'Access code is required' },
                { status: 400 }
            )
        }

        // Fetch exam to check if it requires access code and verify
        const { data: exam, error: examError } = await supabase
            .from('exams')
            .select('id, requires_access_code, access_code, is_active')
            .eq('id', examId)
            .single()

        if (examError || !exam) {
            return NextResponse.json(
                { error: 'Exam not found' },
                { status: 404 }
            )
        }

        if (!exam.is_active) {
            return NextResponse.json(
                { error: 'Exam is not active' },
                { status: 403 }
            )
        }

        if (!exam.requires_access_code) {
            // Exam doesn't require access code, return success
            return NextResponse.json({
                success: true,
                requiresCode: false
            })
        }

        // SERVER-SIDE verification - compare securely
        const isValid = body.accessCode.trim() === exam.access_code

        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid access code', valid: false },
                { status: 401 }
            )
        }

        return NextResponse.json({
            success: true,
            valid: true,
            requiresCode: true
        })

    } catch (error) {
        console.error('Verify access code error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
