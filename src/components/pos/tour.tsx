"use client"

import { useEffect, useState, useRef } from "react"
import { Joyride, type Step, STATUS } from "react-joyride"
import { useAppStore } from "@/lib/store"

interface TourStep extends Step {
  target: string
}

const ADMIN_STEPS: TourStep[] = [
  {
    target: 'body',
    content: "¡Bienvenido al Sistema POS de Droguería! Este tour te guiará por las funciones principales. Usa Siguiente para avanzar.",
    disableBeacon: true,
    placement: "center",
  },
  {
    target: '[data-tour="sidebar-nav"]',
    content: "Este es el menú principal. Desde aquí accedes a todas las secciones: inventario, compras, ventas, caja y reportes.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    content: "El Panel muestra un resumen: ventas del día, alertas de stock bajo y vencimientos, y gráficos.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-products"]',
    content: "En Productos gestionas tu inventario. Creas productos con código de barras, precio, stock y fecha de vencimiento.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-purchases"]',
    content: "En Compras registras las entradas de mercancía de tus proveedores. El stock se actualiza automáticamente.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-pos"]',
    content: "El Punto de Venta es donde se registran las ventas. Busca productos, agrégalos al carrito y cobra.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-cash"]',
    content: "En Caja abres y cierras turnos. Al cerrar, el sistema calcula el arqueo (esperado vs. contado) para detectar faltantes.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-reports"]',
    content: "En Reportes analizas ventas, utilidad, top productos y mejores clientes para tomar decisiones.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="user-menu"]',
    content: "Aquí ves tu rol y puedes cerrar sesión. Recuerda: si tienes caja abierta, el sistema te avisará al salir. ¡Listo!",
    disableBeacon: true,
    placement: "bottom",
  },
]

const VENDEDOR_STEPS: TourStep[] = [
  {
    target: 'body',
    content: "¡Bienvenido! Este tour te guiará por las funciones principales de tu rol como vendedor.",
    disableBeacon: true,
    placement: "center",
  },
  {
    target: '[data-tour="sidebar-nav"]',
    content: "Este es tu menú. Como vendedor, tienes acceso a: Panel, Punto de Venta, Productos (solo consulta), Ventas y Caja.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-pos"]',
    content: "El Punto de Venta es tu herramienta principal. Aquí buscas productos y registras las ventas.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-cash"]',
    content: "En Caja abres tu turno al empezar y lo cierras con arqueo al terminar. Es importante cuadrar antes de irte.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-sales"]',
    content: "En Ventas consultas el historial. Puedes ver el detalle de cada venta, pero solo el admin puede anularlas.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="user-menu"]',
    content: "Aquí cierras sesión. Si tienes caja abierta, el sistema te avisará de hacer el arqueo primero. ¡Listo!",
    disableBeacon: true,
    placement: "bottom",
  },
]

export const TOUR_STORAGE_KEY_PREFIX = "pos-tour-done-"

export default function TourGuide() {
  const role = useAppStore((s) => s.role)
  const [run, setRun] = useState(false)
  const doneRef = useRef(false)

  const steps: TourStep[] = role === "admin" ? ADMIN_STEPS : role === "vendedor" ? VENDEDOR_STEPS : []

  useEffect(() => {
    if (!role || steps.length === 0) return
    const done = localStorage.getItem(TOUR_STORAGE_KEY_PREFIX + role)
    if (!done) {
      const t = setTimeout(() => setRun(true), 1200)
      return () => clearTimeout(t)
    }
  }, [role])

  // Marcar como completado y detener
  const markDone = () => {
    if (doneRef.current) return
    doneRef.current = true
    if (role) localStorage.setItem(TOUR_STORAGE_KEY_PREFIX + role, "1")
    setRun(false)
  }

  const handleCallback = (data: { status?: string; type?: string; action?: string }) => {
    const { status, action } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      markDone()
    }
    // Si se hace clic en "close" (X) o "skip"
    if (action === "close" || action === "skip") {
      markDone()
    }
  }

  // Observer: detectar cuando el tooltip del tour desaparece (tour cerrado sin callback)
  useEffect(() => {
    if (!run) return
    let tooltipWasVisible = false
    const observer = new MutationObserver(() => {
      const tooltip = document.querySelector(".react-joyride__tooltip")
      if (tooltip) {
        tooltipWasVisible = true
      } else if (tooltipWasVisible) {
        // El tooltip estaba visible y ahora desapareció → tour cerrado
        const overlay = document.querySelector(".react-joyride__overlay")
        if (!overlay) {
          setTimeout(() => {
            if (!document.querySelector(".react-joyride__tooltip") && !document.querySelector(".react-joyride__overlay")) {
              markDone()
            }
          }, 500)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [run])

  // Auto-clic en el beacon del primer paso
  useEffect(() => {
    if (!run) return
    const interval = setInterval(() => {
      const beacon = document.querySelector(".react-joyride__beacon") as HTMLElement | null
      const tooltip = document.querySelector(".react-joyride__tooltip")
      if (beacon && !tooltip) {
        beacon.click()
      }
      if (tooltip) {
        clearInterval(interval)
      }
    }, 150)
    const timeout = setTimeout(() => clearInterval(interval), 10000)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [run])

  if (!role || steps.length === 0) return null

  return (
    <Joyride
      steps={steps}
      run={run}
      callback={handleCallback}
      continuous
      showSkipButton
      showProgress
      disableOverlayClose
      locale={{
        back: "Atrás",
        close: "Cerrar",
        last: "Finalizar",
        next: "Siguiente",
        skip: "Saltar",
      }}
      styles={{
        options: {
          primaryColor: "oklch(0.55 0.13 162)",
          zIndex: 9999,
          arrowColor: "oklch(0.22 0.03 165)",
          backgroundColor: "oklch(0.22 0.03 165)",
          textColor: "oklch(0.97 0.01 160)",
          overlayColor: "rgba(0,0,0,0.6)",
          spotlightShadow: "0 0 20px rgba(0,0,0,0.4)",
        },
        tooltip: { borderRadius: 12, padding: 16 },
        tooltipTitle: { color: "oklch(0.97 0.01 160)", fontSize: 15, fontWeight: 700 },
        tooltipContent: { color: "oklch(0.85 0.02 165)", fontSize: 14, lineHeight: 1.5, padding: "8px 0" },
        buttonNext: { borderRadius: 8, padding: "8px 16px", fontWeight: 600 },
        buttonBack: { color: "oklch(0.85 0.02 165)", fontWeight: 500 },
        buttonSkip: { color: "oklch(0.7 0.02 165)", fontWeight: 500 },
      }}
    />
  )
}
