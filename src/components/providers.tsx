"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { NextUIProvider } from "@nextui-org/react"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextUIProvider>
      <NextThemesProvider {...props} attribute="class">
        {children}
      </NextThemesProvider>
    </NextUIProvider>
  )
}
