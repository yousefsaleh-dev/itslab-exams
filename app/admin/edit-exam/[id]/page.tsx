'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import ExamForm, { Question } from '@/components/admin/ExamForm'
import toast from 'react-hot-toast'

export default function EditExamPage() {
    const params = useParams()
    const router = useRouter()
    const { admin } = useAuthStore()
    const [loading, setLoading] = useState(true)
    const [initialData, setInitialData] = useState<{ exam: any, questions: Question[] } | null>(null)

    useEffect(() => {
        if (!admin) {
            router.push('/admin/login')
            return
        }
        fetchExamData()
    }, [admin, params.id])

    const fetchExamData = async () => {
        try {
            // Fetch Exam
            const { data: examData, error: examError } = await supabase
                .from('exams')
                .select('*')
                .eq('id', params.id)
                .single()

            if (examError) throw examError

            // Fetch Questions with Options
            const { data: questionsData, error: questionsError } = await supabase
                .from('questions')
                .select(`
                    *,
                    options (*)
                `)
                .eq('exam_id', params.id)
                .order('question_order')

            if (questionsError) throw questionsError

            // Transform data to match ExamForm expected structure
            const questions: Question[] = questionsData.map((q: any) => ({
                id: q.id,
                question_text: q.question_text,
                points: q.points,
                options: q.options
                    ? q.options
                        .sort((a: any, b: any) => a.option_order - b.option_order)
                        .map((o: any) => ({
                            id: o.id,
                            option_text: o.option_text,
                            is_correct: o.is_correct
                        }))
                    : []
            }))

            setInitialData({
                exam: examData,
                questions
            })
        } catch (error) {
            console.error('Error fetching exam:', error)
            toast.error('Failed to load exam details')
            router.push('/admin/dashboard')
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading exam data...</div>
            </div>
        )
    }

    if (!initialData) return null

    return <ExamForm initialData={initialData} isEditing={true} />
}
