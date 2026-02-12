import { NextRequest, NextResponse } from 'next/server'

// Simple API to return the client's IP address for anti-cheat tracking
export async function GET(request: NextRequest) {
    // Get IP from various headers (works with Vercel, Cloudflare, etc.)
    const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        request.headers.get('cf-connecting-ip') ||
        'unknown'

    return NextResponse.json({
        ip,
        timestamp: new Date().toISOString()
    })
}
