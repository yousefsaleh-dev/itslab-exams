import { create } from 'zustand'
import { Admin } from './supabase'

interface AuthState {
  admin: Admin | null
  setAdmin: (admin: Admin | null) => void
  logout: () => void
}

// Simple localStorage persistence
const getStoredAdmin = (): Admin | null => {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem('admin-auth')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

const setStoredAdmin = (admin: Admin | null) => {
  if (typeof window === 'undefined') return
  try {
    if (admin) {
      localStorage.setItem('admin-auth', JSON.stringify(admin))
    } else {
      localStorage.removeItem('admin-auth')
    }
  } catch {
    // Ignore storage errors
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  admin: getStoredAdmin(),
  setAdmin: (admin) => {
    set({ admin })
    setStoredAdmin(admin)
  },
  logout: () => {
    set({ admin: null })
    setStoredAdmin(null)
  },
}))

// Store for exam taking
interface ExamState {
  attemptId: string | null
  answers: Record<string, string>
  startTime: number | null
  exitCount: number
  setAttemptId: (id: string) => void
  setAnswer: (questionId: string, optionId: string) => void
  setExitCount: (count: number) => void
  incrementExitCount: () => void
  reset: () => void
}

const getStoredExamState = () => {
  if (typeof window === 'undefined') return {
    attemptId: null,
    answers: {},
    startTime: null,
    exitCount: 0,
  }
  try {
    const stored = localStorage.getItem('exam-state')
    return stored ? JSON.parse(stored) : {
      attemptId: null,
      answers: {},
      startTime: null,
      exitCount: 0,
    }
  } catch {
    return {
      attemptId: null,
      answers: {},
      startTime: null,
      exitCount: 0,
    }
  }
}

const setStoredExamState = (state: any) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('exam-state', JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

export const useExamStore = create<ExamState>((set, get) => ({
  ...getStoredExamState(),
  setAttemptId: (id) => {
    const newState = { attemptId: id, startTime: Date.now() }
    set(newState)
    setStoredExamState({ ...get(), ...newState })
  },
  setAnswer: (questionId, optionId) => {
    set((state) => {
      const newAnswers = { ...state.answers, [questionId]: optionId }
      const newState = { answers: newAnswers }
      setStoredExamState({ ...state, ...newState })
      return newState
    })
  },
  setExitCount: (count: number) => {
    set((state) => {
      const newState = { exitCount: count }
      setStoredExamState({ ...state, ...newState })
      return newState
    })
  },
  incrementExitCount: () => {
    set((state) => {
      const newState = { exitCount: state.exitCount + 1 }
      setStoredExamState({ ...state, ...newState })
      return newState
    })
  },
  reset: () => {
    const emptyState = {
      attemptId: null,
      answers: {},
      startTime: null,
      exitCount: 0,
    }
    set(emptyState)
    setStoredExamState(emptyState)
  },
}))