import { db } from "@/lib/db"

export interface NeighborhoodRate {
  id: string
  neighborhood: string
  fee: number
}

export interface DeliveryConfig {
  globalFee: number
  neighborhoodRates: NeighborhoodRate[]
}

export const DEFAULT_DELIVERY_GLOBAL_FEE = 5000

/**
 * Normaliza cadenas para comparación de texto (sin tildes, minúsculas, espacios limpios)
 */
export function normalizeText(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Obtiene la configuración de domicilios (Tarifa Global y Tarifas por Barrio)
 * Soporta configuración global en Setting y fallback automático.
 */
export async function getDeliveryConfig(branchId?: string | null): Promise<DeliveryConfig> {
  try {
    const keys = ["delivery_global_fee", "delivery_neighborhood_rates"]
    const branchKeys = branchId ? [`delivery_global_fee_${branchId}`, `delivery_neighborhood_rates_${branchId}`] : []

    const settings = await db.setting.findMany({
      where: { key: { in: [...keys, ...branchKeys] } },
    })

    const map = new Map<string, string>()
    for (const s of settings) {
      map.set(s.key, s.value)
    }

    // Si hay configuración específica para la sede se usa; si no, la global
    const globalFeeRaw = (branchId && map.get(`delivery_global_fee_${branchId}`)) || map.get("delivery_global_fee")
    const ratesRaw = (branchId && map.get(`delivery_neighborhood_rates_${branchId}`)) || map.get("delivery_neighborhood_rates")

    const globalFee =
      globalFeeRaw !== undefined && !isNaN(Number(globalFeeRaw)) && Number(globalFeeRaw) >= 0
        ? Number(globalFeeRaw)
        : DEFAULT_DELIVERY_GLOBAL_FEE

    let neighborhoodRates: NeighborhoodRate[] = []
    if (ratesRaw) {
      try {
        const parsed = JSON.parse(ratesRaw)
        if (Array.isArray(parsed)) {
          neighborhoodRates = parsed
            .filter((item) => item && typeof item.neighborhood === "string" && item.neighborhood.trim())
            .map((item, index) => ({
              id: String(item.id || `rate-${index}-${Date.now()}`),
              neighborhood: String(item.neighborhood).trim(),
              fee: Math.max(0, Number(item.fee) || 0),
            }))
        }
      } catch (err) {
        console.warn("[getDeliveryConfig Parse Error]:", err)
      }
    }

    return { globalFee, neighborhoodRates }
  } catch (error) {
    console.error("[getDeliveryConfig Error]:", error)
    return {
      globalFee: DEFAULT_DELIVERY_GLOBAL_FEE,
      neighborhoodRates: [],
    }
  }
}

/**
 * Guarda la configuración de domicilios en la base de datos (tabla Setting)
 */
export async function saveDeliveryConfig(params: {
  globalFee: number
  neighborhoodRates: { id?: string; neighborhood: string; fee: number }[]
  branchId?: string | null
}): Promise<DeliveryConfig> {
  const globalFeeNum = Math.max(0, Number(params.globalFee) || 0)
  const cleanedRates: NeighborhoodRate[] = (params.neighborhoodRates || [])
    .filter((r) => r && typeof r.neighborhood === "string" && r.neighborhood.trim())
    .map((r, idx) => ({
      id: String(r.id || `n-${Date.now()}-${idx}`),
      neighborhood: r.neighborhood.trim(),
      fee: Math.max(0, Number(r.fee) || 0),
    }))

  const globalKey = params.branchId ? `delivery_global_fee_${params.branchId}` : "delivery_global_fee"
  const ratesKey = params.branchId ? `delivery_neighborhood_rates_${params.branchId}` : "delivery_neighborhood_rates"

  await db.setting.upsert({
    where: { key: globalKey },
    update: { value: String(globalFeeNum) },
    create: { key: globalKey, value: String(globalFeeNum) },
  })

  await db.setting.upsert({
    where: { key: ratesKey },
    update: { value: JSON.stringify(cleanedRates) },
    create: { key: ratesKey, value: JSON.stringify(cleanedRates) },
  })

  // Si se guardó para una sede, también aseguramos que exista una global por defecto
  if (params.branchId) {
    const existingGlobal = await db.setting.findUnique({ where: { key: "delivery_global_fee" } })
    if (!existingGlobal) {
      await db.setting.create({
        data: { key: "delivery_global_fee", value: String(globalFeeNum) },
      }).catch(() => {})
    }
  }

  return {
    globalFee: globalFeeNum,
    neighborhoodRates: cleanedRates,
  }
}

/**
 * Resuelve la tarifa de envío a partir de una dirección o mensaje del cliente.
 * 1. Busca coincidencias con la lista de barrios configurados.
 * 2. Si encuentra el barrio, retorna el costo de ese barrio.
 * 3. Si no encuentra ningún barrio coincidente o no está en la lista, retorna la tarifa global obligatoria.
 */
export function resolveDeliveryFee(
  textOrAddress: string | null | undefined,
  config: DeliveryConfig
): {
  fee: number
  matchedNeighborhood: string | null
  isCustom: boolean
  appliedRule: string
} {
  if (!textOrAddress || !textOrAddress.trim()) {
    return {
      fee: config.globalFee,
      matchedNeighborhood: null,
      isCustom: false,
      appliedRule: `Tarifa global estándar ($${config.globalFee.toLocaleString("es-CO")})`,
    }
  }

  const normalizedInput = ` ${normalizeText(textOrAddress)} `

  // Priorizar barrios con nombres más largos para evitar falsos positivos
  // (ej. "El Dorado Norte" antes de "El Dorado")
  const sortedRates = [...config.neighborhoodRates].sort(
    (a, b) => b.neighborhood.length - a.neighborhood.length
  )

  for (const item of sortedRates) {
    const normalizedNeighborhood = normalizeText(item.neighborhood)
    if (!normalizedNeighborhood || normalizedNeighborhood.length < 2) continue

    if (
      normalizedInput.includes(` ${normalizedNeighborhood} `) ||
      normalizedInput.includes(normalizedNeighborhood)
    ) {
      return {
        fee: item.fee,
        matchedNeighborhood: item.neighborhood,
        isCustom: true,
        appliedRule: `Tarifa especial para barrio "${item.neighborhood}" ($${item.fee.toLocaleString("es-CO")})`,
      }
    }
  }

  return {
    fee: config.globalFee,
    matchedNeighborhood: null,
    isCustom: false,
    appliedRule: `Tarifa global estándar ($${config.globalFee.toLocaleString("es-CO")}) por no estar en barrios especiales`,
  }
}

/**
 * Construye el bloque explicativo para inyectar en el System Prompt del Agente de IA
 */
export function formatDeliveryPromptContext(config: DeliveryConfig): string {
  const customList =
    config.neighborhoodRates.length > 0
      ? config.neighborhoodRates
          .map((r) => `  * Barrio "${r.neighborhood}": $${r.fee.toLocaleString("es-CO")}`)
          .join("\n")
      : "  * (No hay barrios especiales registrados en la base de datos)."

  return `TABLA OFICIAL DE TARIFAS DE DOMICILIO EN BASE DE DATOS:
- TARIFA GLOBAL ESTÁNDAR: $${config.globalFee.toLocaleString("es-CO")} (OBLIGATORIA: tarifa fija que aplica cuando el barrio no tiene tarifa especial).
- TARIFAS PERSONALIZADAS POR BARRIO (TARIFAS ESPECIALES):
${customList}

REGLAS FUNDAMENTALES DEL AGENTE PARA PREGUNTAR Y DEFINIR LA TARIFA:
1. EL AGENTE DEBE PREGUNTAR LA DIRECCIÓN INCLUYENDO EL BARRIO:
   - Cuando el cliente pida productos o solicite un domicilio y aún no haya indicado su ubicación completa:
   - TÚ (el agente) debes preguntarle expresamente: "¿A qué dirección te lo enviamos y en qué barrio te encuentras?".
   - Si el cliente solo da una calle sin barrio (ej. "calle 10 # 5-20"), pregúntale: "¿En qué barrio queda esa dirección para calcular el envío?".
2. EL AGENTE ES QUIEN DEFINE Y VALIDA LA TARIFA (NUNCA EL CLIENTE):
   - TÚ validas si en la respuesta del cliente mencionó un barrio que coincida con la lista de "TARIFAS PERSONALIZADAS POR BARRIO":
   - SI EL BARRIO COINCIDE CON LA LISTA GUARDADA (ejemplo: Barrio El Dorado): TÚ tomas y aplicas la tarifa guardada para ese barrio ($${config.neighborhoodRates.find((r) => normalizeText(r.neighborhood).includes("dorado"))?.fee?.toLocaleString("es-CO") || "según lista"}).
   - SI EL CLIENTE INDICA UN BARRIO QUE NO ESTÁ EN LA LISTA GUARDADA, O SI NO SE PUEDE DETERMINAR BARRIO ESPECIAL: TÚ aplicas automáticamente la TARIFA GLOBAL OBLIGATORIA ($${config.globalFee.toLocaleString("es-CO")}).
3. CÁLCULO INMEDIATO Y COMUNICACIÓN DEL TOTAL:
   - Sé rápido y asertivo. No hagas esperar al cliente.
   - Suma inmediatamente: Subtotal de productos + Costo de envío definido por ti = Total a pagar.
   - Dile de una vez el desglose y el total:
     * Si fue barrio especial: "Tus productos suman $10.000 + envío a Barrio El Dorado ($4.000) = Total a pagar: $14.000. ¿Cómo prefieres pagar: en efectivo o transferencia?".
     * Si fue tarifa global: "Tus productos suman $10.000 + envío ($${config.globalFee.toLocaleString("es-CO")}) = Total a pagar: $${(10000 + config.globalFee).toLocaleString("es-CO")}. ¿Cómo prefieres pagar: en efectivo o transferencia?".
4. CREACIÓN EXACTA DE LA ORDEN:
   - Cuando el cliente indique si paga en efectivo o transferencia, genera la orden con [ORDEN_AUTO] indicando en "deliveryFee" exactamente la tarifa que tú definiste.`
}
