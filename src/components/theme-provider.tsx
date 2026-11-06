"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// En React 19 / Next.js 16, next-themes inyecta un <script> inline para evitar el parpadeo
// visual de tema claro/oscuro (FOUC). React 19 emite una advertencia/error de consola en desarrollo
// al detectar <script> dentro de un componente cliente. Esta advertencia es un falso positivo conocido
// de next-themes con React 19; se intercepta exclusivamente este mensaje en desarrollo.
if (typeof console !== "undefined") {
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return
    }
    originalConsoleError.apply(console, args)
  }
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
