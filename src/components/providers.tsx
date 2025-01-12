"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { NextUIProvider } from "@nextui-org/react"
import type { SessionValidationResult } from "@/types"
import { useSessionStore } from "@/state/session"
import { useEffect } from "react"

export function ThemeProvider({
  children,
  session,
  ...props
}: React.ComponentProps<typeof NextThemesProvider> & { session: SessionValidationResult }) {
  const { setSession, session: sessionState } = useSessionStore()

  useEffect(() => {
    setSession(session)
  }, [session, sessionState]);

  return (
    <NextUIProvider>
      <NextThemesProvider {...props} attribute="class">
        {children}
      </NextThemesProvider>
    </NextUIProvider>
  )
}
