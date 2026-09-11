"use client"

import * as React from "react"
import { IconMoon, IconSun, IconDeviceDesktop } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export function ThemeToggle({
  className,
  variant = "outline",
}: {
  className?: string
  variant?: "outline" | "ghost" | "default" | "secondary"
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant={variant}
        size="icon"
        className={cn("h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0", className)}
        aria-label="Cambiar tema"
      >
        <IconSun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="icon"
          className={cn("h-8 w-8 sm:h-9 sm:w-9 rounded-full shrink-0 relative transition-transform active:scale-95", className)}
          aria-label="Cambiar tema"
          title={`Tema actual: ${theme === "dark" ? "Oscuro" : theme === "light" ? "Claro" : "Sistema"}`}
        >
          <IconSun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-foreground" />
          <IconMoon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-foreground" />
          <span className="sr-only">Cambiar tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl min-w-[130px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={cn("gap-2.5 cursor-pointer font-medium text-xs", theme === "light" && "bg-muted font-bold text-foreground")}
        >
          <IconSun className="h-4 w-4" /> Claro
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={cn("gap-2.5 cursor-pointer font-medium text-xs", theme === "dark" && "bg-muted font-bold text-foreground")}
        >
          <IconMoon className="h-4 w-4" /> Oscuro
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={cn("gap-2.5 cursor-pointer font-medium text-xs", theme === "system" && "bg-muted font-bold text-foreground")}
        >
          <IconDeviceDesktop className="h-4 w-4 text-muted-foreground" /> Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
