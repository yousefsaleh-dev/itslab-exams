import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
    (await cookies()).delete('admin_token')

    const response = NextResponse.json({ success: true })

    // Also clear cookie in response header just to be safe
    response.cookies.delete('admin_token')

    return response
}
