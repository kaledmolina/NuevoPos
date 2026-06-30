// Helper de fetch para el cliente con manejo de errores y envío de rol

export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  }
  // Adjuntar la sesión (rol + nombre) desde localStorage
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("pos-session")
      if (raw) {
        const { role, name } = JSON.parse(raw)
        if (role) headers["x-user-role"] = role
        if (name) headers["x-user-name"] = encodeURIComponent(name)
      }
    } catch {
      /* noop */
    }
  }
  const res = await fetch(url, { ...options, headers })
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
