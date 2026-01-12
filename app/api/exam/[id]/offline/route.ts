import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// POST /api/exam/[id]/offline - Mark student as offline
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    try {
        const { attemptId } = await request.json()

        if (!attemptId) {
            return NextResponse.json(
                { error: 'attemptId is required' },
                { status: 400 }
            )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 🔒 Lock: Only set went_offline_at if not already offline
        // This prevents overwriting the timestamp if already offline
        const { error } = await supabase
            .from('student_attempts')
            .update({ went_offline_at: new Date().toISOString() })
            .eq('id', attemptId)
            .is('went_offline_at', null) // WHERE went_offline_at IS NULL

        if (error) {
            // console.error('[Offline API] Error marking offline:', error)
            return NextResponse.json(
                { error: 'Failed to mark offline' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        // console.error('[Offline API] POST error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}

// DELETE /api/exam/[id]/offline - Mark student as online and calculate offline duration
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
    try {
        const { attemptId } = await request.json()

        if (!attemptId) {
            return NextResponse.json(
                { error: 'attemptId is required' },
                { status: 400 }
            )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // ✅ SERVER-SIDE calculation (secure - can't be tampered)
        const { data: attempt, error: fetchError } = await supabase
            .from('student_attempts')
            .select('went_offline_at, total_offline_seconds, exam:exams!inner(offline_grace_minutes)')
            .eq('id', attemptId)
            .single()

        if (fetchError || !attempt) {
            // console.error('[Offline API] Error fetching attempt:', fetchError)
            return NextResponse.json(
                { error: 'Attempt not found' },
                { status: 404 }
            )
        }

        // If not offline, nothing to do
        if (!attempt.went_offline_at) {
            return NextResponse.json({
                success: true,
                message: 'Already online',
                totalOffline: attempt.total_offline_seconds || 0
            })
        }

        // 🔐 Server calculates duration (client clock cannot tamper)
        const offlineDuration = Math.floor(
            (Date.now() - new Date(attempt.went_offline_at).getTime()) / 1000
        )

        const graceLimit = (attempt.exam as any).offline_grace_minutes * 60
        const remainingGrace = Math.max(0, graceLimit - (attempt.total_offline_seconds || 0))

        // ✅ Cap at remaining grace (grace used only, not total offline time)
        const additionalOffline = Math.min(offlineDuration, remainingGrace)
        const newTotal = (attempt.total_offline_seconds || 0) + additionalOffline

        // Update database
        const { error: updateError } = await supabase
            .from('student_attempts')
            .update({
                total_offline_seconds: newTotal,
                went_offline_at: null
            })
            .eq('id', attemptId)

        if (updateError) {
            // console.error('[Offline API] Error updating attempt:', updateError)
            return NextResponse.json(
                { error: 'Failed to update offline status' },
                { status: 500 }
            )
        }

        // console.log(`[Offline API] Student back online. Added ${additionalOffline}s offline time (total: ${newTotal}s)`)

        return NextResponse.json({
            success: true,
            offlineAdded: additionalOffline,
            totalOffline: newTotal,
            graceRemaining: Math.max(0, graceLimit - newTotal)
        })
    } catch (error: any) {
        // console.error('[Offline API] DELETE error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
