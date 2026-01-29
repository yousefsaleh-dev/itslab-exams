import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secretKey = process.env.JWT_SECRET || 'a69b7478081b06794b7ecdb3ac7220b6657fc8b421580b083eaf7cbfdc54b902'
const key = new TextEncoder().encode(secretKey)

export async function signToken(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(key)
}

export async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, key, {
            algorithms: ['HS256'],
        })
        return payload
    } catch (error) {
        return null
    }
}

export async function getSession() {
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')?.value
    if (!token) return null
    return await verifyToken(token)
}

export async function setSession(admin: any) {
    const token = await signToken(admin)
    const cookieStore = await cookies()

    cookieStore.set('admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 // 24 hours
    })
}

export async function clearSession() {
    const cookieStore = await cookies()
    cookieStore.delete('admin_token')
}
