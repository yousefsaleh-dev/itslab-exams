
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })

    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId')

    if (!adminId) {
        return NextResponse.json(
            { error: 'Admin ID is required' },
            { status: 400 }
        )
    }

    try {
        const { data: exams, error } = await supabase
            .from('exams')
            .select('*')
            .eq('admin_id', adminId)
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json({ success: true, exams })
    } catch (error: any) {
        return NextResponse.json(
            { error: 'Failed to fetch exams' },
            { status: 500 }
        )
    }
}
