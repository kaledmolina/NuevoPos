// Helper de fetch para el cliente con manejo de errores.
// La sesión (rol) se envía automáticamente como cookie httpOnly firmada,
// no se puede manipular desde el cliente.

export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  }
  const res = await fetch(url, { ...options, headers, credentials: "same-origin" })
  if (!res.ok) {
    let msg = `Error ${res.status}`
    try {
      const data = await res.json()
      msg = data.error || data.message || msg
    } catch {
      /* noop */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
