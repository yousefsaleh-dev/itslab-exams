import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from './lib/auth'

export async function middleware(request: NextRequest) {
    // Only protect /admin routes
    if (request.nextUrl.pathname.startsWith('/admin')) {

        // Allow public admin routes (login, register, forgot-password)
        const publicRoutes = [
            '/admin/login',
            '/admin/register',
            '/admin/forgot-password',
            '/admin/reset-password'
        ]

        if (publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
            return NextResponse.next()
        }

        // Check for session cookie
        const token = request.cookies.get('admin_token')?.value

        if (!token) {
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }

        const payload = await verifyToken(token)

        if (!payload) {
            // Invalid token
            return NextResponse.redirect(new URL('/admin/login', request.url))
        }

        // Token is valid, allow access
        return NextResponse.next()
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*']
}
