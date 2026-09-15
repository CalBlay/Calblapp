'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebaseClient'
import type { AuditDepartment, AuditTemplatePreview, AuditTemplateStatus } from '@/types/auditoria'

const DEFAULT_DEPARTMENT: AuditDepartment = 'comercial'

function normalizeDepartment(value: unknown): AuditDepartment {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (raw === 'serveis') return 'serveis'
  if (raw === 'foodlover' || raw === 'foodlovers' || raw === 'food lover' || raw === 'food lovers') return 'foodlovers'
  if (raw === 'cuina') return 'cuina'
  if (raw === 'logistica') return 'logistica'
  if (raw === 'deco' || raw === 'decoracio' || raw === 'decoracions') return 'deco'
  return DEFAULT_DEPARTMENT
}

function normalizeStatus(value: unknown): AuditTemplateStatus {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
  return raw === 'active' ? 'active' : 'draft'
}

function formatDate(value: unknown): string {
  const toDDMMYYYY = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0')
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const yyyy = String(date.getFullYear())
    return `${dd}/${mm}/${yyyy}`
  }

  try {
    if (value && typeof value === 'object' && 'toDate' in (value as Record<string, unknown>)) {
      const date = (value as { toDate: () => Date }).toDate()
      return toDDMMYYYY(date)
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) return toDDMMYYYY(date)
    }
  } catch {
    // ignore parse errors
  }
  return '-'
}

function blocksCount(blocks: unknown): number {
  if (Array.isArray(blocks)) return blocks.length
  return 0
}

export function useAuditTemplates(options?: { department?: AuditDepartment | null }) {
  const [templates, setTemplates] = useState<AuditTemplatePreview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const reload = () => setReloadTick((n) => n + 1)

  async function createTemplate(params: { name: string; department: AuditDepartment }) {
    const name = params.name.trim()
    if (!name) throw new Error('Cal indicar un nom de plantilla')

    const res = await fetch('/api/auditoria/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, department: params.department }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(String(json?.error || 'No s ha pogut crear la plantilla'))
    }
    reload()
    return String(json?.id || '')
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const baseRef = collection(db, 'audit_templates')
        const ref = options?.department
          ? query(baseRef, where('department', '==', options.department))
          : baseRef
        const snap = await getDocs(ref)
        if (cancelled) return
        const rows: AuditTemplatePreview[] = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>
          return {
            id: docSnap.id,
            name: String(data.name || 'Plantilla sense nom'),
            department: normalizeDepartment(data.department),
            blocks: blocksCount(data.blocks),
            updatedAt: formatDate(data.updatedAt || data.createdAt),
            status: normalizeStatus(data.status),
            isVisible: Boolean(data.isVisible),
          }
        })
        setTemplates(rows)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No s han pogut carregar les plantilles')
          setTemplates([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [reloadTick, options?.department])

  return { templates, loading, error, createTemplate, reload }
}
