"use client"

import { useEffect, useRef } from "react"

interface ParticlesCanvasProps {
  className?: string
  particleCount?: number
  connectDistance?: number
}

export function ParticlesCanvas({
  className = "fixed inset-0 pointer-events-none -z-10",
  particleCount = 65,
  connectDistance = 130,
}: ParticlesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener("resize", handleResize, { passive: true })

    // Detect dark mode reactively
    let isDark = document.documentElement.classList.contains("dark")
    const observer = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains("dark")
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    // Mouse tracking for parallax & hover glow
    const mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000 }
    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX
      mouse.targetY = e.clientY
    }
    const handleMouseLeave = () => {
      mouse.targetX = -1000
      mouse.targetY = -1000
    }
    window.addEventListener("mousemove", handleMouseMove, { passive: true })
    window.addEventListener("mouseleave", handleMouseLeave, { passive: true })

    // Initialize particles
    const count = Math.min(Math.floor(width / 26), particleCount)
    const particles = Array.from({ length: count }, () => {
      const baseAlpha = Math.random() * 0.35 + 0.15
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 2 + 1,
        alpha: baseAlpha,
        baseAlpha,
      }
    })

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      // Smooth mouse easing
      mouse.x += (mouse.targetX - mouse.x) * 0.1
      mouse.y += (mouse.targetY - mouse.y) * 0.1

      const color = isDark ? "255, 255, 255" : "15, 23, 42"

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy

        // Wrap boundaries
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        // Mouse proximity interaction (smooth repel / glow)
        const dx = mouse.x - p.x
        const dy = mouse.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        let alpha = p.baseAlpha

        if (dist < 150) {
          const factor = 1 - dist / 150
          alpha = Math.min(p.baseAlpha + factor * 0.5, 0.9)
          // Gentle nudge away
          p.x -= (dx / dist) * factor * 0.6
          p.y -= (dy / dist) * factor * 0.6
        }

        // Draw particle dot
        ctx.fillStyle = `rgba(${color}, ${alpha * (isDark ? 0.45 : 0.28)})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()

        // Connect nearby particles with luxury thin lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const pdx = p.x - p2.x
          const pdy = p.y - p2.y
          const pdist = Math.sqrt(pdx * pdx + pdy * pdy)

          if (pdist < connectDistance) {
            const lineAlpha = (1 - pdist / connectDistance) * (isDark ? 0.14 : 0.08)
            ctx.strokeStyle = `rgba(${color}, ${lineAlpha})`
            ctx.lineWidth = 0.75
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseleave", handleMouseLeave)
      observer.disconnect()
      cancelAnimationFrame(animationFrameId)
    }
  }, [particleCount, connectDistance])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
    />
  )
}
