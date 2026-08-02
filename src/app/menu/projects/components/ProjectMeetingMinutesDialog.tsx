'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { buildProjectMeetingMinutesHtml } from '@/lib/projectMeetingMinutes'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import {
  BLOCK_STATUS_OPTIONS,
  formatProjectDate,
  type KickoffAttendee,
  type ProjectData,
} from './project-shared'
import { type ResponsibleOption } from './project-workspace-helpers'

type Props = {
  open: boolean
  projectId: string
  project: ProjectData
  generatedByLabel?: string
  kickoffAttendeeOptions: ResponsibleOption[]
  saving?: boolean
  onOpenChange: (open: boolean) => void
  onSaveDraft: (
    payload: { minutes: string; attendees: KickoffAttendee[] },
    options?: { silent?: boolean }
  ) => Promise<ProjectData | null>
  onFinalize: (payload: { minutes: string; attendees: KickoffAttendee[] }) => Promise<ProjectData | null>
  onReopen: () => Promise<ProjectData | null>
}

export default function ProjectMeetingMinutesDialog({
  open,
  projectId,
  project,
  generatedByLabel,
  kickoffAttendeeOptions,
  saving = false,
  onOpenChange,
  onSaveDraft,
  onFinalize,
  onReopen,
}: Props) {
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [notes, setNotes] = useState('')
  const [attendees, setAttendees] = useState<KickoffAttendee[]>([])
  const [closureTab, setClosureTab] = useState<'notes' | 'recull' | 'assistencia'>('notes')
  const [phase, setPhase] = useState<'meeting' | 'closure'>('meeting')
  const [localSaving, setLocalSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [attendeeDraft, setAttendeeDraft] = useState('none')
  const [referenceDraft, setReferenceDraft] = useState('none')

  const isFinalized = project.kickoff.minutesStatus === 'closed'
  const showClosure = phase === 'closure' || isFinalized
  const busy = saving || localSaving

  useEffect(() => {
    if (!open) return
    setNotes(project.kickoff.minutes || '')
    setAttendees(project.kickoff.attendees || [])
    setPhase(isFinalized ? 'closure' : 'meeting')
    setClosureTab('notes')
  }, [open, project.id, project.kickoff.minutes, project.kickoff.attendees, isFinalized])

  useEffect(() => {
    if (!open || showClosure) return
    const timer = window.setTimeout(() => notesRef.current?.focus(), 120)
    return () => window.clearTimeout(timer)
  }, [open, showClosure])

  const referenceOptions = useMemo(() => {
    const items: Array<{ value: string; label: string }> = []
    for (const block of project.blocks) {
      items.push({
        value: `[Bloc: ${block.name || 'Sense nom'}]`,
        label: `Bloc · ${block.name || 'Sense nom'}`,
      })
      for (const task of block.tasks) {
        items.push({
          value: `[Tasca: ${block.name || 'Bloc'} / ${task.title || 'Tasca'}]`,
          label: `Tasca · ${task.title || 'Tasca'} (${block.name || 'Bloc'})`,
        })
      }
    }
    return items
  }, [project.blocks])

  const insertReference = (token: string) => {
    if (!token || token === 'none') return
    const el = notesRef.current
    if (!el) {
      setNotes((current) => `${current}${current && !current.endsWith('\n') ? '\n' : ''}${token}\n`)
      return
    }
    const start = el.selectionStart ?? notes.length
    const end = el.selectionEnd ?? notes.length
    const before = notes.slice(0, start)
    const after = notes.slice(end)
    const prefix = before && !before.endsWith('\n') ? '\n' : ''
    const next = `${before}${prefix}${token}\n${after}`
    setNotes(next)
    requestAnimationFrame(() => {
      const position = before.length + prefix.length + token.length + 1
      el.focus()
      el.setSelectionRange(position, position)
    })
  }

  const saveDraft = async (opts?: { silent?: boolean; closeAfter?: boolean }) => {
    setLocalSaving(true)
    try {
      const saved = await onSaveDraft({ minutes: notes, attendees }, { silent: opts?.silent })
      if (!saved) return
      if (opts?.closeAfter) onOpenChange(false)
    } finally {
      setLocalSaving(false)
    }
  }

  const saveAndReturn = () => void saveDraft({ closeAfter: true })

  const exitDialog = async () => {
    if (busy || sending) return
    if (isFinalized) {
      onOpenChange(false)
      return
    }
    const hasContent =
      notes.trim().length > 0 ||
      attendees.some((item) => item.attended !== undefined) ||
      String(project.kickoff.minutes || '').trim().length > 0
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
    setLocalSaving(true)
    try {
      const saved = await onFinalize({ minutes: notes, attendees })
      if (!saved) return
      setPhase('closure')
      setClosureTab('notes')
      toast({
        title: 'Reunió finalitzada',
        description: "Revisa l'acta, el recull, l'assistència i envia quan estigui llest.",
      })
    } finally {
      setLocalSaving(false)
    }
  }

  const reopenActa = async () => {
    setLocalSaving(true)
    try {
      const saved = await onReopen()
      if (!saved) return
      setPhase('meeting')
      toast({ title: 'Acta reoberta' })
    } finally {
      setLocalSaving(false)
    }
  }

  const handleGenerate = () => {
    const html = buildProjectMeetingMinutesHtml({
      project,
      meetingNotes: notes,
      generatedAtIso: new Date().toISOString(),
      generatedByLabel,
    })
    printBrandedHtmlInNewWindow(html)
  }

  const sendByEmail = async () => {
    setSending(true)
    try {
      const saved = await onSaveDraft({ minutes: notes, attendees }, { silent: true })
      if (!saved) return
      const res = await fetch(`/api/projects/${projectId}/kickoff/minutes/send`, {
        method: 'POST',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'Error enviant'))
      toast({
        title: 'Acta enviada',
        description: `Correu enviat a ${json.recipients ?? 0} destinataris.`,
      })
      onOpenChange(false)
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

  const updateAttendee = (key: string, patch: Partial<KickoffAttendee>) => {
    setAttendees((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const addAttendee = () => {
    const user = kickoffAttendeeOptions.find((item) => item.id === attendeeDraft)
    if (!user || attendeeDraft === 'none') return
    const key = `user:${user.id}`
    if (attendees.some((item) => item.key === key)) return
    setAttendees((current) => [
      ...current,
      {
        key,
        userId: user.id,
        name: user.name,
        email: user.email,
        department: user.department || 'Manual',
        attended: true,
      },
    ])
    setAttendeeDraft('none')
  }

  const recullPanel = (
    <div className="space-y-3">
      <p className={cn(typography('bodySm'), 'text-slate-600')}>
        Resum dels blocs i tasques del projecte en el moment de tancar l&apos;acta.
      </p>
      {project.blocks.length === 0 ? (
        <p className={cn(typography('bodySm'), 'rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-slate-500')}>
          Encara no hi ha blocs al projecte.
        </p>
      ) : (
        project.blocks.map((block) => (
          <div key={block.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{block.name || 'Bloc'}</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                {BLOCK_STATUS_OPTIONS.find((option) => option.value === block.status)?.label || 'En curs'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {block.owner || 'Sense responsable'} · {formatProjectDate(block.deadline) || 'Sense data'}
            </p>
            {block.summary ? <p className="mt-2 text-sm text-slate-600">{block.summary}</p> : null}
            {block.tasks.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                {block.tasks.map((task) => (
                  <li key={task.id}>
                    <span className="font-medium">{task.title || 'Tasca'}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {task.owner || 'Sense responsable'} · {formatProjectDate(task.deadline) || 'Sense data'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-400">Sense tasques en aquest bloc.</p>
            )}
          </div>
        ))
      )}
    </div>
  )

  const attendancePanel = (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={attendeeDraft} onValueChange={setAttendeeDraft}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Afegir assistent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Selecciona usuari</SelectItem>
            {kickoffAttendeeOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name} · {option.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" className="shrink-0" onClick={addAttendee}>
          Afegir assistent
        </Button>
      </div>

      <div className="space-y-2">
        {attendees.length > 0 ? (
          attendees.map((attendee) => (
            <div key={attendee.key} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-[min(100%,240px)] flex-1">
                  <p className="text-sm font-semibold text-slate-900">{attendee.name}</p>
                  <Input
                    type="email"
                    className="mt-2 h-8 text-sm"
                    placeholder="nom@calblay.com"
                    value={attendee.email || ''}
                    onChange={(event) =>
                      updateAttendee(attendee.key, { email: event.target.value.trim().toLowerCase() })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => setAttendees((current) => current.filter((item) => item.key !== attendee.key))}
                >
                  Eliminar
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={attendee.attended !== false ? 'default' : 'outline'}
                  onClick={() => updateAttendee(attendee.key, { attended: true })}
                >
                  Ha assistit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={attendee.attended === false ? 'destructive' : 'outline'}
                  onClick={() => updateAttendee(attendee.key, { attended: false })}
                >
                  No ha assistit
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className={cn(typography('bodySm'), 'rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-slate-500')}>
            Encara no hi ha assistents convocats.
          </p>
        )}
      </div>
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
            disabled={busy || sending}
            aria-label="Sortir"
            title="Sortir (desa l'acta)"
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
              ? "Edita l'acta, revisa el recull de blocs i tasques, marca assistència i envia."
              : 'Apunta el que es parla a la reunió. Pots referenciar blocs i tasques. Desa i torna quan vulguis.'}
          </DialogDescription>
        </DialogHeader>

        {!showClosure ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {referenceOptions.length > 0 ? (
                <>
                  <Select
                    value={referenceDraft}
                    onValueChange={(value) => {
                      setReferenceDraft('none')
                      insertReference(value)
                    }}
                  >
                    <SelectTrigger className="w-full max-w-xs bg-white sm:w-[280px]">
                      <SelectValue placeholder="Referenciar bloc o tasca" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Referenciar bloc o tasca</SelectItem>
                      {referenceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className={cn(typography('bodyXs'), 'text-slate-400')}>
                    Insereix una referència al cursor dels apunts.
                  </p>
                </>
              ) : null}
            </div>
            <label htmlFor="project-meeting-notes-live" className={cn(typography('label'), 'mb-2 shrink-0')}>
              Anotacions de la reunió
            </label>
            <Textarea
              ref={notesRef}
              id="project-meeting-notes-live"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  void saveDraft({ closeAfter: true })
                }
              }}
              className={cn(
                'min-h-[min(58dvh,560px)] flex-1 resize-y border-slate-200 bg-white',
                'text-[15px] leading-[1.65] text-slate-900 shadow-inner sm:text-base'
              )}
              placeholder={
                '• Comentari sobre el bloc de Marqueting\n• [Bloc: Cuina] cal definir el menú\n• [Tasca: Comercial / Preu] revisar abans del dilluns\n• Següent pas…'
              }
            />
            <p className={cn(typography('bodyXs'), 'mt-2 shrink-0 text-slate-400')}>
              Ctrl+Enter per desar i tornar als blocs.
            </p>
          </div>
        ) : (
          <Tabs value={closureTab} className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-3 grid w-auto shrink-0 grid-cols-3 gap-1 bg-transparent p-0 sm:mx-6">
              {(
                [
                  { id: 'notes', label: 'Anotacions' },
                  { id: 'recull', label: 'Recull' },
                  { id: 'assistencia', label: 'Assistència' },
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
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-[min(40dvh,360px)] resize-y bg-white text-base leading-relaxed"
                  placeholder="Text final de l'acta…"
                />
              ) : null}
              {closureTab === 'recull' ? recullPanel : null}
              {closureTab === 'assistencia' ? attendancePanel : null}
            </div>
          </Tabs>
        )}

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
          {!showClosure ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void finalizeMeeting()}>
                Finalitzar reunió
              </Button>
              <Button type="button" disabled={busy} onClick={saveAndReturn}>
                <Save className="mr-2 h-4 w-4" />
                {busy ? 'Desant…' : 'Desar i tornar'}
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busy || sending} onClick={() => onOpenChange(false)}>
                  Sortir als blocs
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void reopenActa()}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reobrir reunió
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button type="button" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
                  <Save className="mr-2 h-4 w-4" />
                  {busy ? 'Desant…' : 'Desar'}
                </Button>
                <Button type="button" variant="outline" onClick={handleGenerate}>
                  Vista prèvia / PDF
                </Button>
                <Button type="button" disabled={sending || busy} onClick={() => void sendByEmail()}>
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
