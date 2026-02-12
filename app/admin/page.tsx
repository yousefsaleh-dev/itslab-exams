'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/admin/dashboard')
    }, [router])

    return (
        <div className="min-h-screen grid place-items-center bg-white text-gray-500">
            Redirecting...
        </div>
    )
}
