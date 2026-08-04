"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { HeroUIProvider } from "@heroui/react"
import type { SessionValidationResult } from "@/types"
import { useSessionStore } from "@/state/session"
import { useEffect, useRef, RefObject, useCallback } from "react"
import { useConfigStore } from "@/state/config"
import type { getConfig } from "@/flags"
import { useEventListener, useDebounceCallback } from 'usehooks-ts';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const SESSION_REFRESH_INTERVAL_MS = 60 * 1000;

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const setSession = useSessionStore((store) => store.setSession)
  const setConfig = useConfigStore((store) => store.setConfig)
  const refetchSession = useSessionStore((store) => store.refetchSession)
  const clearSession = useSessionStore((store) => store.clearSession)
  const documentRef = useRef(typeof window === 'undefined' ? null : document)
  const windowRef = useRef(typeof window === 'undefined' ? null : window)

  // Initialize React Query client
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  const doFetchSession = useCallback(async () => {
    const hadSession = useSessionStore.getState().session !== null

    try {
      if (!hadSession) refetchSession()
      const response = await fetch('/api/get-session')
      const sessionWithConfig = await response.json() as {
        session: SessionValidationResult
        config: Awaited<ReturnType<typeof getConfig>>
      }

      setConfig(sessionWithConfig?.config)

      if (sessionWithConfig?.session) {
        setSession(sessionWithConfig?.session)
      } else {
        clearSession()
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
      if (!hadSession) clearSession()
    }
  }, [setSession, setConfig, clearSession, refetchSession])

  const fetchSession = useDebounceCallback(doFetchSession, 30)
  const fetchSessionIfStale = useCallback(() => {
    const { lastFetched } = useSessionStore.getState()
    const hasFreshSession = lastFetched
      ? Date.now() - lastFetched.getTime() < SESSION_REFRESH_INTERVAL_MS
      : false

    if (!hasFreshSession) fetchSession()
  }, [fetchSession])

  // Initial fetch on mount
  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // Handle refetches
  useEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSessionIfStale()
    }
  }, documentRef as RefObject<Document>)

  useEventListener('focus', () => {
    fetchSessionIfStale()
    // @ts-expect-error window is not defined in the server
  }, windowRef)

  // Add fetchSession to the session store
  useEffect(() => {
    useSessionStore.setState({ fetchSession: doFetchSession })
  }, [doFetchSession])

  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider>
        <NextThemesProvider {...props} attribute="class">
          {children}
        </NextThemesProvider>
      </HeroUIProvider>
    </QueryClientProvider>
  )
}
