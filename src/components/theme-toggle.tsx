"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import { Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThemeToggle({
  className,
  variant = "outline",
  showLabel = false,
}: {
  className?: string
  variant?: "outline" | "ghost" | "default" | "secondary"
  showLabel?: boolean
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const currentTheme = mounted ? (resolvedTheme || theme || "dark") : "dark"
  const isDark = currentTheme === "dark"

  const toggleTheme = React.useCallback(() => {
    // Desactiva transiciones durante el cambio de tema para evitar parpadeos
    if (typeof document !== "undefined") {
      const css = document.createElement("style")
      css.appendChild(
        document.createTextNode(
          `*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}`
        )
      )
      document.head.appendChild(css)
      
      setTheme(isDark ? "light" : "dark")

      window.getComputedStyle(document.body)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (document.head.contains(css)) {
            document.head.removeChild(css)
          }
        })
      })
    } else {
      setTheme(isDark ? "light" : "dark")
    }
  }, [isDark, setTheme])

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-8 rounded-full border border-border/60 bg-background/50 flex items-center justify-center opacity-70",
          showLabel ? "w-20 px-2" : "w-8",
          className
        )}
        aria-hidden="true"
      >
        <Moon className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.94 }}
      onClick={toggleTheme}
      className={cn(
        "relative flex items-center justify-center transition-all cursor-pointer select-none",
        showLabel ? "h-8 px-2.5 gap-1.5 rounded-full" : "h-8 w-8 rounded-full",
        "border border-zinc-200 dark:border-zinc-800",
        "bg-zinc-100/90 hover:bg-zinc-200/90 dark:bg-zinc-900/90 dark:hover:bg-zinc-800/90 backdrop-blur-md",
        "text-zinc-700 dark:text-zinc-200 hover:text-black dark:hover:text-white",
        "hover:border-zinc-400 dark:hover:border-zinc-600 shadow-xs",
        className
      )}
      title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
      aria-label={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="sun"
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex items-center justify-center text-zinc-100"
          >
            <Sun className="h-4 w-4" />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex items-center justify-center text-zinc-900"
          >
            <Moon className="h-4 w-4" />
          </motion.div>
        )}
      </AnimatePresence>
      {showLabel && (
        <span className="text-[11px] font-semibold hidden sm:inline">
          {isDark ? "Claro" : "Oscuro"}
        </span>
      )}
    </motion.button>
  )
}
