'use client'

import { useEffect, useState } from 'react'

export interface Deal {
  id: string
  NomEvent: string
  Comercial: string
  LN?: string
  Servei?: string
  StageGroup: string
  collection?: 'stage_verd' | 'stage_taronja' | 'stage_groc'
  DataInici?: string
  DataFi?: string
  Ubicacio?: string
  Color: string
  StageDot?: string
  HoraInici?: string
  HoraFi?: string
  origen?: 'zoho' | 'manual' | 'firestore'
  NumPax?: number | string | null
  ObservacionsZoho?: string
  code?: string
  codeConfirmed?: boolean
  codeMatchScore?: number | null
  codeStatus?: 'confirmed' | 'review' | 'missing'
  files?: { key: string; url: string }[]
}

export function useCalendarData(filters?: {
  ln?: string | string[]
  stage?: string
  commercial?: string | string[]
  start?: string
  end?: string
}) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalize = (v = '') =>
    v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const isAll = (v?: string) => {
    const n = normalize(v || '')
    if (!n) return true
    if (n === 'all') return true
    if (n.startsWith('tots') || n.startsWith('totes')) return true
    return false
  }

  const toArrayFilter = (value?: string | string[]) => {
    if (Array.isArray(value)) {
      return value.filter(
        (v) => typeof v === 'string' && v.trim() && !isAll(v)
      )
    }
    const single = String(value || '').trim()
    if (!single) return []
    if (isAll(single)) return []
    return [single]
  }

  const normalizeCollection = (
    c?: string
  ): 'stage_verd' | 'stage_taronja' | 'stage_groc' | '' => {
    const n = normalize(c || '')
    if (!n) return ''
    if (n.startsWith('stage_')) return n as any
    if (n === 'verd') return 'stage_verd'
    if (n === 'taronja') return 'stage_taronja'
    if (n === 'groc') return 'stage_groc'
    return ''
  }

  const load = async () => {
    setLoading(true)
    try {
      const start = filters?.start
      const end = filters?.end

      const res = await fetch(
        `/api/events/calendar?start=${start}&end=${end}`,
        { cache: 'no-store' }
      )

      if (!res.ok) throw new Error(`Error ${res.status}`)
      const json = await res.json()

      if (!Array.isArray(json?.events)) {
        setDeals([])
        return
      }

      let data: Deal[] = json.events.map((ev: any) => {
        const fileEntries = Object.entries(ev || {})
          .filter(
            ([k, v]) =>
              k.toLowerCase().startsWith('file') &&
              typeof v === 'string' &&
              v
          )
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([key, url]) => ({ key, url: url as string }))

        const codeValue = String(ev.code || '').trim()
        const codeMatchScore =
          typeof ev.codeMatchScore === 'number' ? ev.codeMatchScore : null
        const codeConfirmed =
          typeof ev.codeConfirmed === 'boolean' ? ev.codeConfirmed : undefined
        let codeStatus: Deal['codeStatus'] = 'missing'
        if (codeValue) {
          if (codeConfirmed === true) {
            codeStatus = 'confirmed'
          } else if (codeConfirmed === false || codeMatchScore === 2) {
            codeStatus = 'review'
          } else {
            codeStatus = 'confirmed'
          }
        }

        const horaRaw =
          ev.HoraInici || ev.horaInici || ev.Hora || ev.hora || ''
        const horaInici =
          typeof horaRaw === 'string' ? horaRaw.trim().slice(0, 5) : ''

        const horaFiRaw =
          ev.HoraFi || ev.horaFi || ''
        const horaFi =
          typeof horaFiRaw === 'string' ? horaFiRaw.trim().slice(0, 5) : ''

        return {
          id: ev.id,
          NomEvent: ev.summary || '(Sense titol)',
          Comercial: ev.Comercial || ev.comercial || '',
          LN: ev.LN || ev.lnLabel || 'Altres',
          Servei: ev.Servei || ev.servei || '',
          StageGroup: ev.StageGroup || '',
          collection: normalizeCollection(ev.collection) || undefined,

          DataInici: ev.start?.slice(0, 10),
          DataFi: ev.end?.slice(0, 10),
          Ubicacio: ev.Ubicacio || ev.ubicacio || ev.location || ev.Location || '',
          Color: ev.Color || '',
          StageDot: ev.StageDot || '',
          HoraInici: horaInici,
          HoraFi: horaFi || undefined,

          // FIX: Pax robust
          NumPax:
            ev.NumPax ??
            ev.numPax ??
            ev.pax ??
            ev.PAX ??
            null,

          // FIX: Observacions Zoho
          ObservacionsZoho:
            ev.ObservacionsZoho ??
            ev.observacionsZoho ??
            ev.Observacions ??
            ev.observacions ??
            '',

          code: codeValue,
          codeConfirmed,
          codeMatchScore,
          codeStatus,
          origen: ev.origen || 'firestore',
          files: fileEntries,
        }
      })

      /* ---------- LN ---------- */
      const lnValues = toArrayFilter(filters?.ln)
      if (lnValues.length) {
        const lnSet = new Set(lnValues.map(normalize))
        data = data.filter((d) => lnSet.has(normalize(d.LN || '')))
      }

      /* ---------- STAGE ---------- */
      if (!isAll(filters?.stage)) {
        const st = normalize(filters!.stage!)
        data = data.filter((d) => {
          const col = d.collection || ''
          if (st === 'confirmat') return col === 'stage_verd'
          if (st === 'calentet') return col === 'stage_taronja'
          if (st === 'pressupost') return col === 'stage_groc'
          return true
        })
      }

      /* ---------- COMERCIAL ---------- */
      const commercialValues = toArrayFilter(filters?.commercial)
      if (commercialValues.length) {
        const cSet = new Set(commercialValues.map(normalize))
        data = data.filter((d) => cSet.has(normalize(d.Comercial || '')))
      }

      data.sort(
        (a, b) =>
          new Date(a.DataInici || '').getTime() -
          new Date(b.DataInici || '').getTime()
      )

      setDeals(data)
      setError(null)
    } catch (e: any) {
      console.error(e)
      setDeals([])
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters?.ln,
    filters?.stage,
    filters?.commercial,
    filters?.start,
    filters?.end,
  ])

  return { deals, loading, error, reload: load }
}
