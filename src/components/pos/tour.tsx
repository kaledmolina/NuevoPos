"use client"

import { useEffect, useState } from "react"
import { Joyride, type Step, STATUS, EVENTS } from "react-joyride"
import { useAppStore } from "@/lib/store"
import { type Role } from "@/lib/permissions"

interface TourStep extends Step {
  target: string
}

const ADMIN_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-nav"]',
    content: "Este es el menú principal. Desde aquí accedes a todas las secciones del sistema: inventario, compras, ventas, caja y reportes.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    content: "El Panel muestra un resumen: ventas del día, alertas de stock bajo y vencimientos, y gráficos.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-products"]',
    content: "En Productos gestionas tu inventario. Aquí creas productos con código de barras, precio, stock y fecha de vencimiento.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-purchases"]',
    content: "En Compras registras las entradas de mercancía de tus proveedores. El stock se actualiza automáticamente.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-pos"]',
    content: "El Punto de Venta es donde se registran las ventas. Busca productos, agrégalos al carrito y cobra.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-cash"]',
    content: "En Caja abres y cierras turnos. Al cerrar, el sistema calcula el arqueo (esperado vs. contado) para detectar faltantes.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-reports"]',
    content: "En Reportes analizas ventas, utilidad, top productos y mejores clientes para tomar decisiones.",
    placement: "right",
  },
  {
    target: '[data-tour="user-menu"]',
    content: "Aquí ves tu rol y puedes cerrar sesión. Recuerda: si tienes caja abierta, el sistema te avisará al salir.",
    placement: "bottom",
  },
]

const VENDEDOR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-nav"]',
    content: "Bienvenido. Este es tu menú. Como vendedor, tienes acceso a: Panel, Punto de Venta, Productos (solo consulta), Ventas y Caja.",
    disableBeacon: true,
    placement: "right",
  },
  {
    target: '[data-tour="nav-pos"]',
    content: "El Punto de Venta es tu herramienta principal. Aquí buscas productos y registras las ventas.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-cash"]',
    content: "En Caja abres tu turno al empezar y lo cierras con arqueo al terminar. Es importante cuadrar antes de irte.",
    placement: "right",
  },
  {
    target: '[data-tour="nav-sales"]',
    content: "En Ventas consultas el historial. Puedes ver el detalle de cada venta, pero solo el admin puede anularlas.",
    placement: "right",
  },
  {
    target: '[data-tour="user-menu"]',
    content: "Aquí cierras sesión. Si tienes caja abierta, el sistema te avisará de hacer el arqueo primero.",
    placement: "bottom",
  },
]

const STORAGE_KEY_PREFIX = "pos-tour-done-"

export default function TourGuide() {
  const role = useAppStore((s) => s.role)
  const view = useAppStore((s) => s.view)
  const [run, setRun] = useState(false)

  const steps = role === "admin" ? ADMIN_STEPS : role === "vendedor" ? VENDEDOR_STEPS : []

  useEffect(() => {
    if (!role) return
    // Solo ejecutar si no se completó antes para este rol
    const done = localStorage.getItem(STORAGE_KEY_PREFIX + role)
    if (!done) {
      // Pequeño delay para que el DOM esté listo
      const t = setTimeout(() => setRun(true), 800)
      return () => clearTimeout(t)
    }
  }, [role])

  const handleCallback = (data: { status?: string; type?: string; index?: number; action?: string }) => {
    const { status } = data
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      if (role) localStorage.setItem(STORAGE_KEY_PREFIX + role, "1")
      setRun(false)
    }
  }

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
        skip: "Saltar tour",
      }}
      styles={{
        options: {
          primaryColor: "oklch(0.55 0.13 162)",
          zIndex: 9999,
          arrowColor: "oklch(0.22 0.03 165)",
          backgroundColor: "oklch(0.22 0.03 165)",
          textColor: "oklch(0.97 0.01 160)",
          overlayColor: "rgba(0,0,0,0.5)",
          spotlightShadow: "0 0 20px rgba(0,0,0,0.4)",
        },
        tooltip: {
          borderRadius: 12,
          padding: 16,
        },
        tooltipTitle: {
          color: "oklch(0.97 0.01 160)",
          fontSize: 15,
          fontWeight: 700,
        },
        tooltipContent: {
          color: "oklch(0.85 0.02 165)",
          fontSize: 14,
          lineHeight: 1.5,
          padding: "8px 0",
        },
        buttonNext: {
          borderRadius: 8,
          padding: "8px 16px",
          fontWeight: 600,
        },
        buttonBack: {
          color: "oklch(0.85 0.02 165)",
          fontWeight: 500,
        },
        buttonSkip: {
          color: "oklch(0.7 0.02 165)",
          fontWeight: 500,
        },
      }}
    />
  )
}

// Botón para reiniciar el tour manualmente
export function RestartTourButton() {
  const role = useAppStore((s) => s.role)

  const restart = () => {
    if (!role) return
    localStorage.removeItem(STORAGE_KEY_PREFIX + role)
    // Forzar recarga para que el TourGuide se reinicie
    window.location.reload()
  }

  if (!role) return null
  return null // placeholder — el tour se reinicia desde el menú de ayuda si se implementa
}
