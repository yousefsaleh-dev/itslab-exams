import Link from 'next/link'
import { BookOpen, ShieldCheck, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        {/* Logo / Icon */}
        <div className="inline-flex p-4 bg-white rounded-2xl shadow-xl mb-4">
          <ShieldCheck className="w-16 h-16 text-blue-600" />
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent pb-2">
          Secure Exam Portal
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Welcome to the student examination portal.
          <br />
          To access your exam, please use the <span className="font-semibold text-blue-700">unique link provided by your instructor</span>.
        </p>

        {/* Info Card */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-gray-200/50 p-8 max-w-2xl mx-auto mt-12 text-left">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Student Instructions</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span>Check your email or course dashboard for the exam URL.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span>Ensure you have a stable internet connection.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span>Do not close the exam window once you start.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer / Admin Link */}
        <div className="pt-12 text-sm text-gray-500">
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors duration-200"
          >
            Instructor Login <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
