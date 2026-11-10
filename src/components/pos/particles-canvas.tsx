"use client"

import { useEffect, useRef } from "react"

export type ParticlesColorScheme = "mono" | "emerald" | "violet"

interface ParticlesCanvasProps {
  className?: string
  particleCount?: number
  connectDistance?: number
  colorScheme?: ParticlesColorScheme
}

// Particle types: A (60%), B (30%), C (10%)
type ParticleType = "A" | "B" | "C"

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  baseAlpha: number
  type: ParticleType
  pulseOffset: number // for type B alpha pulse
}

function pickType(): ParticleType {
  const r = Math.random()
  if (r < 0.6) return "A"
  if (r < 0.9) return "B"
  return "C"
}

export function ParticlesCanvas({
  className = "fixed inset-0 pointer-events-none -z-10",
  particleCount = 65,
  connectDistance = 130,
  colorScheme = "mono",
}: ParticlesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d", { alpha: true })
    if (!ctx) return

    let animationFrameId: number
    let lastFrameTime = 0
    const TARGET_FPS = 60
    const FRAME_INTERVAL = 1000 / TARGET_FPS

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

    // Mouse tracking
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

    // Initialize particles with 3 types
    const count = Math.min(Math.floor(width / 26), particleCount)
    const particles: Particle[] = Array.from({ length: count }, () => {
      const type = pickType()
      let radius: number
      let baseAlpha: number
      let speed: number

      if (type === "A") {
        radius = Math.random() * 1 + 1       // 1–2
        baseAlpha = Math.random() * 0.3 + 0.1
        speed = 0.25
      } else if (type === "B") {
        radius = Math.random() * 1 + 2       // 2–3
        baseAlpha = Math.random() * 0.3 + 0.15
        speed = 0.45
      } else {
        // Type C: "star" particles
        radius = 1
        baseAlpha = Math.random() * 0.4 + 0.5 // high alpha
        speed = 0.75
      }

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speed * 2,
        vy: (Math.random() - 0.5) * speed * 2,
        radius,
        alpha: baseAlpha,
        baseAlpha,
        type,
        pulseOffset: Math.random() * Math.PI * 2,
      }
    })

    let frameCount = 0

    const render = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(render)

      // FPS cap
      const elapsed = timestamp - lastFrameTime
      if (elapsed < FRAME_INTERVAL) return
      lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL)
      frameCount++

      ctx.clearRect(0, 0, width, height)

      // Smooth mouse easing
      mouse.x += (mouse.targetX - mouse.x) * 0.1
      mouse.y += (mouse.targetY - mouse.y) * 0.1

      // Color selection based on scheme + dark mode
      let colorA: string
      let colorB: string

      if (isDark) {
        if (colorScheme === "violet") {
          colorA = "139, 92, 246"  // violet
          colorB = "255, 255, 255" // white
        } else {
          colorA = "255, 255, 255"
          colorB = "255, 255, 255"
        }
      } else {
        // light mode: always monochrome dark
        colorA = "15, 23, 42"
        colorB = "15, 23, 42"
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy

        // Wrap boundaries
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        const dx = mouse.x - p.x
        const dy = mouse.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        let alpha = p.baseAlpha
        // Assign color: type C stars get colorA (violet in dark), others alternate
        const useColorA = p.type === "C" || i % 3 === 0
        const particleColor = useColorA ? colorA : colorB

        if (p.type === "B") {
          // Leve pulse de alpha for type B
          const pulse = Math.sin(frameCount * 0.03 + p.pulseOffset) * 0.1
          alpha = Math.max(0, Math.min(1, p.baseAlpha + pulse))
        }

        if (p.type === "C") {
          // Type C: near mouse → attract & glow
          if (dist < 120) {
            const factor = 1 - dist / 120
            alpha = Math.min(0.95, p.baseAlpha + factor * 0.5)
            // Move gently toward mouse instead of away
            p.x += (dx / (dist + 1)) * factor * 0.4
            p.y += (dy / (dist + 1)) * factor * 0.4
          }
        } else {
          // Type A & B: gentle repel on mouse proximity
          if (dist < 150) {
            const factor = 1 - dist / 150
            alpha = Math.min(p.baseAlpha + factor * 0.4, 0.85)
            p.x -= (dx / (dist + 1)) * factor * 0.5
            p.y -= (dy / (dist + 1)) * factor * 0.5
          }
        }

        // Alpha multiplier based on dark/light
        const alphaMult = isDark ? 0.5 : 0.32
        ctx.fillStyle = `rgba(${particleColor}, ${alpha * alphaMult})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fill()

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const pdx = p.x - p2.x
          const pdy = p.y - p2.y
          const pdist = Math.sqrt(pdx * pdx + pdy * pdy)

          if (pdist < connectDistance) {
            const lineAlpha = (1 - pdist / connectDistance) * (isDark ? 0.14 : 0.08)
            const lineColor = isDark && colorScheme === "violet" ? "139, 92, 246" : particleColor
            ctx.strokeStyle = `rgba(${lineColor}, ${lineAlpha})`
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }
      }
    }

    animationFrameId = requestAnimationFrame(render)

    return () => {
      window.removeEventListener("resize", handleResize)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseleave", handleMouseLeave)
      observer.disconnect()
      cancelAnimationFrame(animationFrameId)
    }
  }, [particleCount, connectDistance, colorScheme])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
    />
  )
}
