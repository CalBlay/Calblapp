'use client'

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { coerceChatReport } from './coerce-chat-report'
import { defaultFincaMonthRange } from './default-finca-range'
import { mcpErrorFromApi } from './mcp-helpers'
import {
  buildOpenChatInformePdfHtml,
  exportOpenChatToXlsx,
  printHtmlInNewWindow,
} from './open-chat-export'
import type {
  FincaRankingRow,
  FullByCodePayload,
  McpUiError,
  OpenChatAnswer,
  StageEventRow,
  StageVerdEventByCode,
} from './types'

export function useConsultesMcpPage() {
  const eventsLoadAbortRef = useRef<AbortController | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const eventByCodeAbortRef = useRef<AbortController | null>(null)
  const fincaAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      eventsLoadAbortRef.current?.abort()
      chatAbortRef.current?.abort()
      eventByCodeAbortRef.current?.abort()
      fincaAbortRef.current?.abort()
    }
  }, [])

  const [limit, setLimit] = useState('10')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<McpUiError | null>(null)
  const [rows, setRows] = useState<StageEventRow[]>([])
  const [meta, setMeta] = useState<{ count?: number; ok?: boolean } | null>(null)

  const [eventCode, setEventCode] = useState('')
  const [loadingCode, setLoadingCode] = useState(false)
  const [errorCode, setErrorCode] = useState<McpUiError | null>(null)
  const [fullEvent, setFullEvent] = useState<FullByCodePayload | null>(null)

  const [{ start: fincaStart, end: fincaEnd }, setFincaRange] = useState(defaultFincaMonthRange)
  const [fincaLn, setFincaLn] = useState('')
  const [fincaLines, setFincaLines] = useState<string[]>([])
  const [fincaLoading, setFincaLoading] = useState(false)
  const [fincaError, setFincaError] = useState<McpUiError | null>(null)
  const [fincaRows, setFincaRows] = useState<FincaRankingRow[]>([])
  const [fincaMeta, setFincaMeta] = useState<{
    totalImportSum: number
    eventDocsInRange: number
    note?: string
  } | null>(null)

  const [openQuestion, setOpenQuestion] = useState('')
  const [openRich, setOpenRich] = useState(true)
  const [openLoading, setOpenLoading] = useState(false)
  const [openError, setOpenError] = useState<McpUiError | null>(null)
  const [openAnswer, setOpenAnswer] = useState<OpenChatAnswer | null>(null)

  const load = useCallback(async () => {
    eventsLoadAbortRef.current?.abort()
    const controller = new AbortController()
    eventsLoadAbortRef.current = controller
    const { signal } = controller

    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({ limit: limit.trim() || '10' })
      const res = await fetch(`/api/mcp/events?${q.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (signal.aborted) return
      const data = (await res.json()) as {
        ok?: boolean
        count?: number
        data?: StageEventRow[]
        error?: string
        hint?: string
        raw?: string
      }
      if (signal.aborted) return
      const failed = !res.ok || data.ok === false
      if (failed) {
        setError(mcpErrorFromApi(data, res.status))
        setRows([])
        setMeta(null)
        return
      }
      setMeta({ ok: data.ok, count: data.count })
      setRows(Array.isArray(data.data) ? data.data : [])
    } catch (e) {
      if (signal.aborted) return
      setError({ message: e instanceof Error ? e.message : 'Error de xarxa' })
      setRows([])
      setMeta(null)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [limit])

  const submitOpenQuestion = useCallback(async () => {
    const q = openQuestion.trim()
    if (!q) {
      setOpenError({ message: 'Escriu una pregunta' })
      setOpenAnswer(null)
      return
    }
    chatAbortRef.current?.abort()
    const controller = new AbortController()
    chatAbortRef.current = controller
    const { signal } = controller

    setOpenLoading(true)
    setOpenError(null)
    setOpenAnswer(null)
    try {
      const res = await fetch('/api/mcp/chat', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, language: 'ca', rich: openRich }),
        signal,
      })
      if (signal.aborted) return
      const data = (await res.json()) as {
        ok?: boolean
        answer?: string
        model?: string
        toolCallsUsed?: number
        cached?: boolean
        report?: unknown
        traceId?: string
        result?: { traceId?: string }
        toolChoiceSource?: string
        error?: string
        hint?: string
        raw?: string
      }
      if (signal.aborted) return
      if (!res.ok || data.ok === false) {
        setOpenError(mcpErrorFromApi(data, res.status))
        return
      }
      const fromTop = typeof data.traceId === 'string' ? data.traceId.trim() : ''
      const fromNested =
        typeof data.result?.traceId === 'string' ? data.result.traceId.trim() : ''
      const traceIdRaw = fromTop || fromNested
      const answer: OpenChatAnswer = {
        text: String(data.answer ?? ''),
        model: data.model,
        toolCallsUsed:
          typeof data.toolCallsUsed === 'number' ? data.toolCallsUsed : undefined,
        cached: data.cached === true,
        report: openRich ? coerceChatReport(data.report) : null,
        traceId: traceIdRaw || undefined,
        toolChoiceSource:
          typeof data.toolChoiceSource === 'string' && data.toolChoiceSource.trim()
            ? data.toolChoiceSource.trim()
            : undefined,
      }
      if (signal.aborted) return
      startTransition(() => {
        setOpenAnswer(answer)
      })
    } catch (e) {
      if (signal.aborted) return
      setOpenError({ message: e instanceof Error ? e.message : 'Error de xarxa' })
    } finally {
      if (!signal.aborted) setOpenLoading(false)
    }
  }, [openQuestion, openRich])

  const handleOpenChatExportExcel = useCallback(async () => {
    if (!openAnswer) return
    await exportOpenChatToXlsx(openQuestion, openAnswer)
  }, [openAnswer, openQuestion])

  const handleOpenChatPdfTable = useCallback(() => {
    if (!openAnswer) return
    const html = buildOpenChatInformePdfHtml(openQuestion, openAnswer)
    printHtmlInNewWindow(html)
  }, [openAnswer, openQuestion])

  const handleOpenChatPdfView = useCallback(() => {
    window.print()
  }, [])

  const openChatExportItems = useMemo(
    () => [
      { label: 'Excel (.xlsx)', onClick: handleOpenChatExportExcel },
      { label: 'PDF (vista)', onClick: handleOpenChatPdfView },
      { label: 'PDF (informe)', onClick: handleOpenChatPdfTable },
    ],
    [handleOpenChatExportExcel, handleOpenChatPdfTable, handleOpenChatPdfView]
  )

  const loadByCode = useCallback(async () => {
    const code = eventCode.trim()
    if (!code) {
      setErrorCode({ message: 'Introdueix un code (ex. C2500012)' })
      setFullEvent(null)
      return
    }
    eventByCodeAbortRef.current?.abort()
    const controller = new AbortController()
    eventByCodeAbortRef.current = controller
    const { signal } = controller

    setLoadingCode(true)
    setErrorCode(null)
    setFullEvent(null)
    try {
      const res = await fetch(
        `/api/mcp/event-by-code?${new URLSearchParams({ code }).toString()}`,
        { credentials: 'include', cache: 'no-store', signal }
      )
      if (signal.aborted) return
      const body = (await res.json()) as {
        ok?: boolean
        data?: FullByCodePayload
        error?: string
        hint?: string
        raw?: string
      }
      if (signal.aborted) return
      if (!res.ok || !body.ok || !body.data) {
        setErrorCode(mcpErrorFromApi(body, res.status))
        return
      }
      setFullEvent(body.data)
    } catch (e) {
      if (signal.aborted) return
      setErrorCode({ message: e instanceof Error ? e.message : 'Error de xarxa' })
    } finally {
      if (!signal.aborted) setLoadingCode(false)
    }
  }, [eventCode])

  const loadFincaRanking = useCallback(async () => {
    fincaAbortRef.current?.abort()
    const controller = new AbortController()
    fincaAbortRef.current = controller
    const { signal } = controller

    setFincaLoading(true)
    setFincaError(null)
    try {
      const params = new URLSearchParams({
        start: fincaStart,
        end: fincaEnd,
        top: '10',
      })
      if (fincaLn.trim()) params.set('ln', fincaLn.trim())
      const res = await fetch(`/api/reports/finca-facturacio?${params}`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (signal.aborted) return
      const data = (await res.json()) as {
        ok?: boolean
        rows?: FincaRankingRow[]
        lines?: string[]
        totalImportSum?: number
        eventDocsInRange?: number
        note?: string
        error?: string
      }
      if (signal.aborted) return
      if (!res.ok || !data.ok) {
        setFincaError({ message: data.error || `Error ${res.status}` })
        setFincaRows([])
        setFincaMeta(null)
        return
      }
      setFincaRows(Array.isArray(data.rows) ? data.rows : [])
      setFincaLines(Array.isArray(data.lines) ? data.lines : [])
      setFincaMeta({
        totalImportSum: data.totalImportSum ?? 0,
        eventDocsInRange: data.eventDocsInRange ?? 0,
        note: data.note,
      })
    } catch (e) {
      if (signal.aborted) return
      setFincaError({ message: e instanceof Error ? e.message : 'Error de xarxa' })
      setFincaRows([])
      setFincaMeta(null)
    } finally {
      if (!signal.aborted) setFincaLoading(false)
    }
  }, [fincaStart, fincaEnd, fincaLn])

  const fincaChartData = useMemo(() => {
    return [...fincaRows].sort((a, b) => a.importSum - b.importSum)
  }, [fincaRows])

  const chartData = useMemo(() => {
    if (!fullEvent?.event) return []
    const e = fullEvent.event as StageVerdEventByCode
    const preu = Number(e.PreuMenu)
    const imp = Number(e.Import)
    const out: { name: string; value: number }[] = []
    if (Number.isFinite(preu)) out.push({ name: 'Preu menú', value: preu })
    if (Number.isFinite(imp)) out.push({ name: 'Import total', value: imp })
    return out
  }, [fullEvent])

  const ticketMig = useMemo(() => {
    if (!fullEvent?.event) return null
    const e = fullEvent.event as StageVerdEventByCode
    const imp = Number(e.Import)
    const pax = Number(e.NumPax)
    if (!Number.isFinite(imp) || !Number.isFinite(pax) || pax <= 0) return null
    return Math.round((imp / pax) * 100) / 100
  }, [fullEvent])

  const sortedEntries = useMemo(() => {
    if (!fullEvent?.event) return []
    return Object.entries(fullEvent.event as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b, 'ca')
    )
  }, [fullEvent])

  const ev: StageVerdEventByCode | undefined = fullEvent?.event as
    | StageVerdEventByCode
    | undefined

  return {
    limit,
    setLimit,
    loading,
    error,
    rows,
    meta,
    load,
    eventCode,
    setEventCode,
    loadingCode,
    errorCode,
    loadByCode,
    fullEvent,
    ev,
    chartData,
    ticketMig,
    sortedEntries,
    fincaStart,
    fincaEnd,
    setFincaRange,
    fincaLn,
    setFincaLn,
    fincaLines,
    fincaLoading,
    fincaError,
    fincaRows,
    fincaMeta,
    loadFincaRanking,
    fincaChartData,
    openQuestion,
    setOpenQuestion,
    openRich,
    setOpenRich,
    openLoading,
    openError,
    openAnswer,
    submitOpenQuestion,
    openChatExportItems,
  }
}
