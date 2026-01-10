import Link from 'next/link'
import { BookOpen, ShieldCheck, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-white relative overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Gradient Orbs - subtle background effect */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />

      <div className="max-w-4xl w-full text-center space-y-8 relative z-10">
        {/* Logo / Icon */}
        <div className="inline-flex items-center gap-3 mb-4">
          <div className="w-14 h-14 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl flex items-center justify-center shadow-lg shadow-black/10">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <span className="text-lg font-semibold text-gray-900">Exam System</span>
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 tracking-tight">
          Secure Exam Portal
        </h1>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          Welcome to the student examination portal.
          <br />
          To access your exam, please use the <span className="font-semibold text-gray-900">unique link provided by your instructor</span>.
        </p>

        {/* Info Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/10 border border-gray-200/60 p-8 max-w-2xl mx-auto mt-12 text-left">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-gray-100 rounded-xl">
              <BookOpen className="w-6 h-6 text-gray-900" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Student Instructions</h3>
              <ul className="space-y-3 text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                  <span>Check your email or course dashboard for the exam URL.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                  <span>Ensure you have a stable internet connection.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
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
            className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors duration-200 font-medium"
          >
            Instructor Login <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
