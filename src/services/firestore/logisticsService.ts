// ✅ file: src/services/firestore/logisticsService.ts
'use client'

/**
 * Actualitza camps de preparació d'un esdeveniment logístic via API (no SDK client).
 */
export async function updatePreparation(id: string, data?: string, hora?: string) {
  if (!id) return

  const res = await fetch(`/api/logistics/stage-verd/${encodeURIComponent(id)}/preparation`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preparacioData: data,
      preparacioHora: hora,
    }),
  })

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || `HTTP ${res.status}`)
  }
}
