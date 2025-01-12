import { SessionValidationResult } from '@/types';
import { create } from 'zustand'
import { combine } from 'zustand/middleware'

export const useSessionStore = create(
  combine(
    {
      session: null as SessionValidationResult | null,
      isLoading: true,
    },
    (set) => ({
      setSession: (session: SessionValidationResult) => set({ session, isLoading: false }),
      clearSession: () => set({ session: null, isLoading: false }),
    })
  )
)
