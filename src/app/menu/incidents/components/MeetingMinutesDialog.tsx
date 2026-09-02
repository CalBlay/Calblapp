'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Mail, RotateCcw, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import {
  buildIncidentsMeetingMinutesHtml,
  type MeetingMinutesFilters,
} from '@/lib/incidentsMeetingMinutes'
import {
  activeMeetingAttendees,
  defaultMeetingIncidentFilters,
  type IncidentMeetingAttendee,
  type IncidentMeetingComments,
  type IncidentMeetingSession,
} from '@/lib/incidentMeetingSession'
import {
  isCoreAttendeeKey,
  mergeMeetingAttendees,
  type AppUserRow,
} from '@/lib/incidentMeetingAttendees'
import type { Incident } from '@/hooks/useIncidents'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import MeetingGuestSearchCombobox from './MeetingGuestSearchCombobox'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultFilters: MeetingMinutesFilters
  generatedByLabel?: string
  onSessionStatusChange?: (status: 'draft' | 'finalized' | null) => void
  sessionId?: string | null
  initialSession?: IncidentMeetingSession | null
}

function normalizeActionStatusLabel(raw?: string | null) {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'done') return 'Tancada'
  if (value === 'in_progress') return 'En curs'
  return 'Oberta'
}

function buildMeetingMinutesActionText(action: Record<string, unknown>) {
  const title = String(action.title || '').trim()
  const description = String(action.description || '').trim()
  const assignedToName = String(action.assignedToName || '').trim()
  const parts = [title || description || 'Acció sense títol']
  if (assignedToName) parts.push(`Responsable: ${assignedToName}`)
  parts.push(`Estat: ${normalizeActionStatusLabel(String(action.status || 'open'))}`)
  return parts.join(' · ')
}

function RecullFiltersPanel({
  filters,
  loadingIncidents,
  incidentCount,
  onFilterChange,
}: {
  filters: MeetingMinutesFilters
  loadingIncidents: boolean
  incidentCount: number
  onFilterChange: <K extends keyof MeetingMinutesFilters>(key: K, value: MeetingMinutesFilters[K]) => void
}) {
  return (
    <div className="space-y-3">
      <p className={cn(typography('bodySm'), 'text-slate-600')}>
        L acta inclou totes les incidències del període triat.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={cn(typography('bodyXs'), 'mb-1 block text-slate-500')}>Des de</label>
          <Input
            type="date"
            value={filters.from || ''}
            onChange={(e) => onFilterChange('from', e.target.value || undefined)}
          />
        </div>
        <div>
          <label className={cn(typography('bodyXs'), 'mb-1 block text-slate-500')}>Fins a</label>
          <Input
            type="date"
            value={filters.to || ''}
            onChange={(e) => onFilterChange('to', e.target.value || undefined)}
          />
        </div>
      </div>
      <p className={typography('bodySm')}>
        Total incidències: <strong>{loadingIncidents ? '…' : incidentCount}</strong>
      </p>
    </div>
  )
}

export default function MeetingMinutesDialog({
  open,
  onOpenChange,
  defaultFilters,
  generatedByLabel,
  onSessionStatusChange,
  sessionId,
  initialSession,
}: Props) {
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [session, setSession] = useState<IncidentMeetingSession | null>(null)
  const [notes, setNotes] = useState('')
  const [filters, setFilters] = useState<MeetingMinutesFilters>(defaultMeetingIncidentFilters())
  const [attendees, setAttendees] = useState<IncidentMeetingAttendee[]>([])
  const [coreAttendees, setCoreAttendees] = useState<IncidentMeetingAttendee[]>([])
  const [guestUsers, setGuestUsers] = useState<AppUserRow[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loadingSession, setLoadingSession] = useState(false)
  const [loadingIncidents, setLoadingIncidents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [closureTab, setClosureTab] = useState('assistencia')
  const [phase, setPhase] = useState<'meeting' | 'closure'>('meeting')
  const historyMode = Boolean(sessionId)

  const isFinalized = session?.status === 'finalized'
  const showClosure = phase === 'closure' || isFinalized

  const filtersWithDefaults = useCallback(
    (): MeetingMinutesFilters => ({
      ...defaultMeetingIncidentFilters(defaultFilters),
      ...filters,
      from: filters.from || defaultFilters.from,
      to: filters.to || defaultFilters.to,
      department: filters.department || defaultFilters.department,
      categoryLabel: filters.categoryLabel || defaultFilters.categoryLabel,
    }),
    [defaultFilters, filters]
  )
  const loadMeetingAttendees = useCallback(async () => {
    const res = await fetch('/api/incidents/meeting-minutes/attendees', { cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return
    const core = Array.isArray(json.coreAttendees) ? (json.coreAttendees as IncidentMeetingAttendee[]) : []
    const guests = Array.isArray(json.guestUsers) ? (json.guestUsers as AppUserRow[]) : []
    setCoreAttendees(core)
    setGuestUsers(guests)
    return core
  }, [])

  const applySession = useCallback((next: IncidentMeetingSession | null) => {
    setSession(next)
    onSessionStatusChange?.(next?.status ?? null)
    if (!next) {
      setNotes('')
      setFilters(defaultMeetingIncidentFilters(defaultFilters))
      setAttendees([])
      setPhase('meeting')
      return
    }
    setNotes(next.notes)
    setFilters(next.incidentFilters)
    setPhase(next.status === 'finalized' ? 'closure' : 'meeting')
    if (next.status === 'finalized') {
      setClosureTab('assistencia')
    }
  }, [defaultFilters, onSessionStatusChange])

  const loadSession = useCallback(async () => {
    setLoadingSession(true)
    try {
      const params = new URLSearchParams()
      if (sessionId) params.set('id', sessionId)
      const url = `/api/incidents/meeting-minutes${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error carregant acta'))
      applySession(json.session || null)
      if (!json.session) {
        setFilters(defaultMeetingIncidentFilters(defaultFilters))
        onSessionStatusChange?.(null)
      }
    } catch (e) {
      toast({
        title: 'Error carregant acta',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setLoadingSession(false)
    }
  }, [applySession, defaultFilters, onSessionStatusChange, sessionId])

  const loadIncidents = useCallback(async (
    nextFilters: MeetingMinutesFilters,
    meetingComments: IncidentMeetingComments = {}
  ) => {
    const from = String(nextFilters.from || '').trim()
    const to = String(nextFilters.to || '').trim()
    if (!from || !to) {
      setIncidents([])
      return
    }
    setLoadingIncidents(true)
    try {
      const params = new URLSearchParams({ from, to, importance: 'all', categoryLabel: 'all', light: '1' })
      const res = await fetch(`/api/incidents?${params.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error carregant incidències'))
      const rows = Array.isArray(json.incidents) ? (json.incidents as Incident[]) : []
      const incidentIds = rows.map((row) => String(row.id || '').trim()).filter(Boolean)
      if (incidentIds.length === 0) {
        setIncidents(rows.map((row) => ({
          ...row,
          meetingComment: meetingComments[String(row.id || '').trim()]?.text || '',
        })))
        return
      }

      const actionsRes = await fetch('/api/incidents/actions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentIds }),
      })
      const actionsJson = await actionsRes.json().catch(() => ({}))
      if (!actionsRes.ok) throw new Error(String(actionsJson?.error || 'Error carregant accions'))

      const grouped = new Map<string, string[]>()
      const actions = Array.isArray(actionsJson.actions)
        ? (actionsJson.actions as Array<Record<string, unknown>>)
        : []

      for (const action of actions) {
        const incidentId = String(action.incidentId || '').trim()
        if (!incidentId) continue
        const current = grouped.get(incidentId) || []
        current.push(buildMeetingMinutesActionText(action))
        grouped.set(incidentId, current)
      }

      setIncidents(
        rows.map((row) => ({
          ...row,
          meetingMinutesActionsText: (grouped.get(String(row.id || '').trim()) || []).join('\n'),
          meetingComment: meetingComments[String(row.id || '').trim()]?.text || '',
        }))
      )
    } catch {
      setIncidents([])
    } finally {
      setLoadingIncidents(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (initialSession && sessionId && initialSession.id === sessionId) {
      applySession(initialSession)
    }
    void loadSession()
    void loadMeetingAttendees()
    // Només en obrir el diàleg — evita recarregar després de finalitzar i esborrar l’estat.
  }, [open, initialSession, sessionId, loadMeetingAttendees, loadSession, applySession])

  useEffect(() => {
    if (!coreAttendees.length) {
      if (session?.attendees?.length) setAttendees(session.attendees)
      return
    }
    const saved = session?.attendees?.length ? session.attendees : []
    setAttendees(mergeMeetingAttendees(saved, coreAttendees))
  }, [coreAttendees, session?.id, session?.attendees])

  useEffect(() => {
    if (!open || showClosure || loadingSession) return
    const timer = window.setTimeout(() => notesRef.current?.focus(), 120)
    return () => window.clearTimeout(timer)
  }, [open, showClosure, loadingSession])

  useEffect(() => {
    if (!open || !showClosure) return
    const timer = window.setTimeout(() => {
      void loadIncidents(filtersWithDefaults(), session?.incidentComments || {})
    }, 300)
    return () => window.clearTimeout(timer)
  }, [open, showClosure, filters, loadIncidents, filtersWithDefaults, closureTab, session?.incidentComments])

  const ensureSession = async (): Promise<IncidentMeetingSession | null> => {
    if (session?.id) return session
    const res = await fetch('/api/incidents/meeting-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes,
        incidentFilters: filters,
        attendees,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.session) {
      throw new Error(String(json?.error || 'No s ha pogut crear l acta'))
    }
    const next = json.session as IncidentMeetingSession
    applySession(next)
    return next
  }

  const saveDraft = async (opts?: { silent?: boolean; closeAfter?: boolean }) => {
    setSaving(true)
    try {
      const current = await ensureSession()
      if (!current) return
      const nextFilters = showClosure ? filtersWithDefaults() : filters
      const res = await fetch('/api/incidents/meeting-minutes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: current.id,
          action: 'save',
          notes,
          incidentFilters: nextFilters,
          attendees,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error desant'))
      applySession(json.session as IncidentMeetingSession)
      if (opts?.closeAfter) {
        onOpenChange(false)
        return
      }
      if (!opts?.silent) toast({ title: 'Acta desada' })
    } catch (e) {
      toast({
        title: 'Error desant',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const saveAndReturn = () => void saveDraft({ closeAfter: true })

  const createNewDraftSession = async (): Promise<IncidentMeetingSession> => {
    const res = await fetch('/api/incidents/meeting-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        forceNew: true,
        notes: '',
        incidentFilters: defaultMeetingIncidentFilters(defaultFilters),
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.session) {
      throw new Error(String(json?.error || 'No s ha pogut iniciar una nova acta'))
    }
    return json.session as IncidentMeetingSession
  }

  const startNextMeetingCycle = async () => {
    await createNewDraftSession()
    onSessionStatusChange?.('draft')
    onOpenChange(false)
  }

  const completeFinalizedActaAndClose = async () => {
    if (saving || sending) return
    setSaving(true)
    try {
      if (session?.id) {
        const res = await fetch('/api/incidents/meeting-minutes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: session.id,
            action: 'save',
            notes,
            incidentFilters: filtersWithDefaults(),
            attendees,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(json?.error || 'Error desant'))
      }
      if (historyMode) onOpenChange(false)
      else await startNextMeetingCycle()
    } catch (e) {
      toast({
        title: 'Error tancant acta',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const exitDialog = async () => {
    if (saving || sending) return
    if (loadingSession) {
      onOpenChange(false)
      return
    }
    if (session?.status === 'finalized' && !historyMode) {
      await completeFinalizedActaAndClose()
      return
    }
    const hasContent =
      notes.trim().length > 0 ||
      Boolean(session?.id) ||
      attendees.some((a) => a.attendance !== null)
    if (hasContent) {
      await saveDraft({ silent: true, closeAfter: true })
    } else {
      onOpenChange(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true)
      return
    }
    void exitDialog()
  }

  const finalizeMeeting = async () => {
    setSaving(true)
    try {
      const current = await ensureSession()
      if (!current) return
      const nextFilters = filtersWithDefaults()
      setFilters(nextFilters)
      const res = await fetch('/api/incidents/meeting-minutes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: current.id,
          action: 'finalize',
          notes,
          incidentFilters: nextFilters,
          attendees,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error finalitzant'))
      const finalized = json.session as IncidentMeetingSession
      setPhase('closure')
      setClosureTab('assistencia')
      applySession(finalized)
      toast({
        title: 'Reunió finalitzada',
        description: 'Revisa l acta, el recull, l assistència i envia quan estigui llest.',
      })
    } catch (e) {
      toast({
        title: 'Error finalitzant',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const reopenActa = async () => {
    if (!session?.id) return
    setSaving(true)
    try {
      const res = await fetch('/api/incidents/meeting-minutes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id, action: 'reopen' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error reobrint'))
      applySession(json.session as IncidentMeetingSession)
      setPhase('meeting')
      toast({ title: 'Acta reoberta' })
    } catch (e) {
      toast({
        title: 'Error reobrint',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const startNewActa = async () => {
    if (historyMode) return
    setSaving(true)
    try {
      const next = await createNewDraftSession()
      applySession(next)
      onSessionStatusChange?.('draft')
      setPhase('meeting')
      setNotes('')
      toast({ title: 'Nova acta iniciada' })
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleGenerate = () => {
    const html = buildIncidentsMeetingMinutesHtml({
      incidents,
      filters: filtersWithDefaults(),
      meetingNotes: notes,
      generatedAtIso: new Date().toISOString(),
      generatedByLabel,
      attendance: activeMeetingAttendees(attendees).map((a) => ({
        name: a.name,
        email: a.email,
        attendance: a.attendance,
        absenceReason: a.absenceReason,
      })),
    })
    printBrandedHtmlInNewWindow(html)
  }

  const sendByEmail = async () => {
    if (!session?.id) return
    setSending(true)
    try {
      const saveRes = await fetch('/api/incidents/meeting-minutes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          action: 'save',
          attendees,
          incidentFilters: filtersWithDefaults(),
        }),
      })
      const saveJson = await saveRes.json().catch(() => ({}))
      if (!saveRes.ok) throw new Error(String(saveJson?.error || 'Error desant assistència'))
      applySession(saveJson.session as IncidentMeetingSession)

      const res = await fetch('/api/incidents/meeting-minutes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: session.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error enviant'))
      toast({
        title: 'Acta enviada',
        description: `Correu enviat a ${json.recipients ?? 0} destinataris.`,
      })
      if (historyMode) await loadSession()
      else await startNextMeetingCycle()
    } catch (e) {
      toast({
        title: 'Error enviant correu',
        description: e instanceof Error ? e.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const attendeeUserIds = useMemo(
    () => new Set(attendees.map((a) => a.userId).filter(Boolean)),
    [attendees]
  )

  const coreAttendeeList = useMemo(
    () => activeMeetingAttendees(attendees).filter((a) => isCoreAttendeeKey(a.key)),
    [attendees]
  )

  const guestAttendeeList = useMemo(
    () => activeMeetingAttendees(attendees).filter((a) => !isCoreAttendeeKey(a.key)),
    [attendees]
  )

  const excludedAttendeeList = useMemo(
    () => attendees.filter((a) => a.receiveEmail === false),
    [attendees]
  )

  const addGuest = (user: AppUserRow) => {
    if (attendees.some((a) => a.userId === user.id)) return
    setAttendees((prev) => [
      ...prev,
      {
        key: `guest:${user.id}`,
        userId: user.id,
        name: user.name,
        email: user.email,
        department: user.department || '',
        attendance: null,
        absenceReason: '',
        receiveEmail: true,
      },
    ])
  }

  const updateAttendee = (key: string, patch: Partial<IncidentMeetingAttendee>) => {
    setAttendees((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)))
  }

  const removeFromList = (key: string) => {
    if (isCoreAttendeeKey(key)) {
      updateAttendee(key, { receiveEmail: false })
      return
    }
    setAttendees((prev) => prev.filter((a) => a.key !== key))
  }

  const restoreToList = (key: string) => {
    updateAttendee(key, { receiveEmail: true })
  }

  const renderAttendeeCard = (attendee: IncidentMeetingAttendee, opts?: { removable?: boolean }) => (
    <div
      key={attendee.key}
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {attendee.name}
            {isCoreAttendeeKey(attendee.key) ? (
              <span className={cn(typography('bodyXs'), 'ml-2 font-normal text-slate-400')}>
                Convocat
              </span>
            ) : (
              <span className={cn(typography('bodyXs'), 'ml-2 font-normal text-violet-600')}>
                Convidat
              </span>
            )}
          </p>
          <div className="mt-1 min-w-[min(100%,240px)]">
            <label
              htmlFor={`attendee-email-${attendee.key}`}
              className={cn(typography('bodyXs'), 'mb-1 block text-slate-500')}
            >
              Correu
            </label>
            <Input
              id={`attendee-email-${attendee.key}`}
              type="email"
              className={cn(
                'h-8 text-sm',
                !attendee.email?.includes('@') && 'border-amber-300 focus-visible:ring-amber-400'
              )}
              placeholder="nom@calblay.com"
              value={attendee.email || ''}
              onChange={(e) =>
                updateAttendee(attendee.key, { email: e.target.value.trim().toLowerCase() })
              }
            />
            {!attendee.email?.includes('@') ? (
              <p className={cn(typography('bodyXs'), 'mt-1 text-amber-700')}>
                Sense correu a usuaris — afegeix-lo per poder enviar l acta.
              </p>
            ) : null}
          </div>
        </div>
        {opts?.removable !== false ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-red-600"
            onClick={() => removeFromList(attendee.key)}
          >
            Eliminar
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={attendee.attendance === 'in_person' ? 'default' : 'outline'}
          onClick={() => updateAttendee(attendee.key, { attendance: 'in_person', absenceReason: '' })}
        >
          Ha vingut
        </Button>
        <Button
          type="button"
          size="sm"
          variant={attendee.attendance === 'online' ? 'secondary' : 'outline'}
          onClick={() => updateAttendee(attendee.key, { attendance: 'online', absenceReason: '' })}
        >
          Online
        </Button>
        <Button
          type="button"
          size="sm"
          variant={attendee.attendance === 'absent' ? 'destructive' : 'outline'}
          onClick={() => updateAttendee(attendee.key, { attendance: 'absent' })}
        >
          No ha vingut
        </Button>
      </div>
      {attendee.attendance === 'absent' ? (
        <Input
          className="mt-2"
          placeholder="Motiu de l absència"
          value={attendee.absenceReason || ''}
          onChange={(e) => updateAttendee(attendee.key, { absenceReason: e.target.value })}
        />
      ) : null}
    </div>
  )

  const setFilterField = <K extends keyof MeetingMinutesFilters>(key: K, value: MeetingMinutesFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const attendancePanel = (
    <div className="space-y-4">
      <div>
        <p className={cn(typography('label'), 'mb-2')}>Convocats (fixos)</p>
        <div className="space-y-2">
          {coreAttendeeList.map((attendee) => renderAttendeeCard(attendee))}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className={cn(typography('label'), 'mb-2')}>Convidats</p>
        <MeetingGuestSearchCombobox
          users={guestUsers}
          excludeIds={attendeeUserIds}
          onPick={addGuest}
        />
        <div className="mt-3 space-y-2">
          {guestAttendeeList.length === 0 ? (
            <p className={cn(typography('bodySm'), 'text-slate-500')}>
              Cap convidat afegit. Cerca un usuari de l app si cal.
            </p>
          ) : (
            guestAttendeeList.map((attendee) => renderAttendeeCard(attendee))
          )}
        </div>
      </div>

      {excludedAttendeeList.length > 0 ? (
        <div className="border-t border-slate-100 pt-4">
          <p className={cn(typography('label'), 'mb-2')}>Exclosos del correu</p>
          <div className="space-y-2">
            {excludedAttendeeList.map((attendee) => (
              <div
                key={attendee.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2"
              >
                <span className={cn(typography('bodySm'), 'text-slate-600')}>{attendee.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => restoreToList(attendee.key)}
                >
                  Tornar a incloure
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 [&>button]:hidden',
          showClosure ? 'sm:max-w-3xl' : 'sm:max-w-4xl lg:max-w-5xl'
        )}
        lockDismissOnOutside
      >
        <DialogHeader className="relative shrink-0 space-y-1 border-b border-slate-100 px-5 py-4 pr-14 sm:px-6 sm:pr-16">
          <button
            type="button"
            className="absolute right-4 top-4 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            onClick={() => void exitDialog()}
            disabled={saving || sending}
            aria-label="Sortir al tauler"
            title="Sortir al tauler (desa l acta)"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className={cn('flex items-center gap-2', typography('cardTitle'))}>
              <FileText className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
              {showClosure ? 'Tancament de reunió' : 'Apunt ràpid'}
            </DialogTitle>
            {showClosure ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                Reunió finalitzada
              </span>
            ) : null}
          </div>
          <DialogDescription className={typography('bodySm')}>
            {showClosure
              ? 'Edita l acta, tria el recull, marca assistència i envia. Pots sortir quan vulguis: l acta es desa i la reunió segueix finalitzada.'
              : 'Apunta el que comenteu fora de les incidències. Desa i torna al tauler.'}
          </DialogDescription>
        </DialogHeader>

        {loadingSession ? (
          <p className={cn('px-6 py-8', typography('bodySm'))}>Carregant acta…</p>
        ) : !showClosure ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
            <label htmlFor="meeting-notes-live" className={cn(typography('label'), 'mb-2 shrink-0')}>
              Anotacions de la reunió
            </label>
            <Textarea
              ref={notesRef}
              id="meeting-notes-live"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void saveDraft({ closeAfter: true })
                }
              }}
              className={cn(
                'min-h-[min(58dvh,560px)] flex-1 resize-y border-slate-200 bg-white',
                'text-[15px] leading-[1.65] text-slate-900 shadow-inner sm:text-base'
              )}
              placeholder={'• Comentari fora de la incidència\n• Acord general\n• Següent pas…'}
            />
            <p className={cn(typography('bodyXs'), 'mt-2 shrink-0 text-slate-400')}>
              Ctrl+Enter per desar i tornar a les incidències.
            </p>
          </div>
        ) : (
          <Tabs value={closureTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-3 grid w-auto shrink-0 grid-cols-3 gap-1 bg-transparent p-0 sm:mx-6">
              {(
                [
                  { id: 'assistencia', label: 'Assistència' },
                  { id: 'recull', label: 'Recull' },
                  { id: 'notes', label: 'Anotacions' },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  onClick={() => setClosureTab(tab.id)}
                  className={cn(
                    'rounded-lg px-3 py-2',
                    closureTab === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
              {closureTab === 'notes' ? (
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[min(40dvh,360px)] resize-y bg-white text-base leading-relaxed"
                  placeholder="Text final de l acta…"
                />
              ) : null}
              {closureTab === 'recull' ? (
                <RecullFiltersPanel
                  filters={filters}
                  loadingIncidents={loadingIncidents}
                  incidentCount={incidents.length}
                  onFilterChange={setFilterField}
                />
              ) : null}
              {closureTab === 'assistencia' ? attendancePanel : null}
            </div>
          </Tabs>
        )}

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
          {!showClosure ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void finalizeMeeting()}
              >
                Finalitzar reunió
              </Button>
              <Button type="button" disabled={saving} onClick={saveAndReturn}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Desant…' : 'Desar i tornar'}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || sending}
                  onClick={() => void exitDialog()}
                >
                  {historyMode ? 'Tancar' : 'Sortir al tauler'}
                </Button>
                {!historyMode ? (
                  <Button type="button" variant="ghost" disabled={saving} onClick={() => void startNewActa()}>
                    Nova acta
                  </Button>
                ) : null}
                <Button type="button" variant="outline" disabled={saving} onClick={() => void reopenActa()}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reobrir reunió
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button type="button" variant="outline" disabled={saving} onClick={() => void saveDraft()}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Desant…' : 'Desar'}
                </Button>
                <Button type="button" variant="outline" onClick={handleGenerate}>
                  Vista prèvia / PDF
                </Button>
                <Button type="button" disabled={sending || saving} onClick={() => void sendByEmail()}>
                  <Mail className="mr-2 h-4 w-4" />
                  {sending ? 'Enviant…' : 'Enviar per correu'}
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
