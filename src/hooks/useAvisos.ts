// file: src/hooks/useAvisos.ts
'use client'

import { useCallback, useEffect, useState } from 'react'

/* ───────────────────────── TIPUS ───────────────────────── */

export interface Aviso {
  id: string
  code: string
  content: string
  createdAt: string
  editedAt?: string | null
  createdBy: {
    name: string
    department: string
  }
}

/* ───────────────────────── HOOK ───────────────────────── */
export function useAvisos(eventCode: string | null) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* ================= LOAD ================= */
  const loadAvisos = useCallback(async () => {
    const code = (eventCode || '').toString().trim()
    if (!code) {
      setAvisos([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const qs = new URLSearchParams({ code })
      const res = await fetch(`/api/avisos?${qs.toString()}`)
      if (!res.ok) throw new Error('Error carregant avisos')

      const data = await res.json()
      setAvisos(data.avisos || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconegut')
    } finally {
      setLoading(false)
    }
  }, [eventCode])

  /* ================= CREATE ================= */
const createAviso = async (payload: {
  eventCode: string
  content: string
  userName: string
  department: string
}) => {
  const res = await fetch('/api/avisos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: payload.eventCode, // 🔑 CONVERSIÓ CLAU
      content: payload.content,
      userName: payload.userName,
      department: payload.department,
    }),
  })

  if (!res.ok) {
    throw new Error('Error guardant avís')
  }

  await loadAvisos()
}


  /* ================= UPDATE ================= */
const updateAviso = async (id: string, content: string) => {
  const res = await fetch('/api/avisos', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      content,
      editedAt: new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    throw new Error('Error editant avís')
  }

  await loadAvisos()
}

  /* ================= DELETE ================= */
  const deleteAviso = async (id: string) => {
    const res = await fetch('/api/avisos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })

    if (!res.ok) {
      throw new Error('Error eliminant avís')
    }

    await loadAvisos()
  }

  /* ================= INIT ================= */
  useEffect(() => {
    void loadAvisos()
  }, [loadAvisos])

  return {
    avisos,
    loading,
    error,
    reload: loadAvisos,
    createAviso,
    updateAviso,
    deleteAviso,
  }
}
