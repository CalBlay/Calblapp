'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Mail, X } from 'lucide-react'
import type { CalendarMailGroup } from '@/lib/calendar/calendarMailGroups'
import { CALENDAR_MAIL_GROUPS_PATH } from '@/lib/calendar/calendarPermissions'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { displayCalendarFileName } from '@/lib/calendar/calendarFiles'

export type CalendarDocumentFile = {
  key: string
  url: string
  name?: string
}

export type CalendarRecipientCandidate = {
  key: string
  role: string
  name: string
}

type ResolvedRecipient = CalendarRecipientCandidate & {
  email: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  collection?: string
  eventTitle: string
  eventCode?: string
  files: CalendarDocumentFile[]
  recipientCandidates: CalendarRecipientCandidate[]
  eventLN?: string
  canManageMailGroups?: boolean
}

export default function CalendarSendDocumentsDialog({
  open,
  onOpenChange,
  eventId,
  collection = 'stage_verd',
  eventTitle,
  eventCode,
  files,
  recipientCandidates,
  eventLN,
  canManageMailGroups = false,
}: Props) {
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [sending, setSending] = useState(false)
  const [recipientList, setRecipientList] = useState<ResolvedRecipient[]>([])
  const [selectedRecipientKeys, setSelectedRecipientKeys] = useState<string[]>([])
  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([])
  const [resolvedFiles, setResolvedFiles] = useState<CalendarDocumentFile[]>([])
  const [loadingFileNames, setLoadingFileNames] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [mailGroups, setMailGroups] = useState<CalendarMailGroup[]>([])
  const [loadingMailGroups, setLoadingMailGroups] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const defaultSubject = useMemo(() => {
    const title = String(eventTitle || '').trim() || 'Esdeveniment'
    const code = String(eventCode || '').trim()
    return code ? `Documents · ${title} (${code})` : `Documents · ${title}`
  }, [eventCode, eventTitle])

  const defaultMessage = useMemo(() => {
    const title = String(eventTitle || '').trim() || 'l’esdeveniment'
    return `Us adjunto la documentació relativa a l’esdeveniment «${title}».`
  }, [eventTitle])

  useEffect(() => {
    if (!open) return
    setSubject(defaultSubject)
    setMessage(defaultMessage)
    setManualEmail('')
    setRecipientList([])
    setSelectedRecipientKeys([])
    setResolvedFiles(files)
    setSelectedFileKeys(files.map((file) => file.key))
    setSelectedGroupId('')
  }, [open, defaultMessage, defaultSubject, files])

  useEffect(() => {
    if (!open) return

    let active = true
    const load = async () => {
      setLoadingMailGroups(true)
      try {
        const query = eventLN ? `?ln=${encodeURIComponent(eventLN)}` : ''
        const res = await fetch(`/api/calendar/mail-groups${query}`, { cache: 'no-store' })
        const data = await res.json()
        if (!active) return
        setMailGroups(Array.isArray(data?.groups) ? data.groups : [])
      } catch (err) {
        console.error('Error carregant grups d’enviament:', err)
        if (active) setMailGroups([])
      } finally {
        if (active) setLoadingMailGroups(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [open, eventLN])

  useEffect(() => {
    if (!open || files.length === 0) return

    let active = true
    const load = async () => {
      setLoadingFileNames(true)
      try {
        const res = await fetch('/api/calendar/resolve-file-names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        })
        const data = await res.json()
        if (!active) return
        if (Array.isArray(data?.files) && data.files.length > 0) {
          setResolvedFiles(data.files as CalendarDocumentFile[])
        } else {
          setResolvedFiles(files)
        }
      } catch (err) {
        console.error('Error resolent noms de fitxers:', err)
        if (active) setResolvedFiles(files)
      } finally {
        if (active) setLoadingFileNames(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [open, files])

  useEffect(() => {
    if (!open) return

    const candidates = recipientCandidates.filter((item) => String(item.name || '').trim())
    if (candidates.length === 0) {
      setRecipientList([])
      setSelectedRecipientKeys([])
      return
    }

    let active = true
    const load = async () => {
      setLoadingRecipients(true)
      try {
        const res = await fetch('/api/calendar/resolve-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: candidates.map((item) => item.name) }),
        })
        const data = (await res.json()) as { resolved?: Array<{ name?: string; email?: string }> }
        const resolvedList = Array.isArray(data.resolved) ? data.resolved : []
        const emailByName = new Map<string, string>(
          resolvedList.map((item) => [
            String(item.name || '').trim(),
            String(item.email || '').trim(),
          ])
        )

        const next = candidates
          .map(
            (candidate): ResolvedRecipient => ({
              key: candidate.key,
              role: candidate.role,
              name: candidate.name,
              email: String(emailByName.get(candidate.name) ?? ''),
            })
          )
          .filter((candidate) => candidate.email.includes('@'))

        if (!active) return
        setRecipientList(next)
        setSelectedRecipientKeys(next.map((item) => item.key))
      } catch (err) {
        console.error('Error resolent correus:', err)
        if (active) {
          setRecipientList([])
          setSelectedRecipientKeys([])
        }
      } finally {
        if (active) setLoadingRecipients(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [open, recipientCandidates])

  const selectedRecipients = useMemo(
    () => recipientList.filter((item) => selectedRecipientKeys.includes(item.key)),
    [recipientList, selectedRecipientKeys]
  )

  const selectedFiles = useMemo(
    () => resolvedFiles.filter((file) => selectedFileKeys.includes(file.key)),
    [resolvedFiles, selectedFileKeys]
  )

  const setRecipientSelected = (key: string, selected: boolean) => {
    setSelectedRecipientKeys((current) => {
      if (selected) return current.includes(key) ? current : [...current, key]
      return current.filter((item) => item !== key)
    })
  }

  const setFileSelected = (key: string, selected: boolean) => {
    setSelectedFileKeys((current) => {
      if (selected) return current.includes(key) ? current : [...current, key]
      return current.filter((item) => item !== key)
    })
  }

  const removeRecipient = (key: string) => {
    setRecipientList((current) => current.filter((item) => item.key !== key))
    setSelectedRecipientKeys((current) => current.filter((item) => item !== key))
  }

  const addGroupRecipients = (group: CalendarMailGroup) => {
    setRecipientList((current) => {
      const byEmail = new Map(current.map((item) => [item.email.toLowerCase(), item]))
      for (const member of group.members) {
        const email = member.email.trim().toLowerCase()
        if (!email.includes('@') || byEmail.has(email)) continue
        byEmail.set(email, {
          key: `email:${email}`,
          role: `Grup «${group.name}»`,
          name: member.name || email,
          email: member.email,
        })
      }
      const next = Array.from(byEmail.values())
      setSelectedRecipientKeys((selected) => {
        const keys = new Set(selected)
        group.members.forEach((member) => {
          const email = member.email.trim().toLowerCase()
          const found = next.find((item) => item.email.toLowerCase() === email)
          if (found) keys.add(found.key)
        })
        return Array.from(keys)
      })
      return next
    })
  }

  const addSelectedGroup = () => {
    const group = mailGroups.find((item) => item.id === selectedGroupId)
    if (!group) return
    addGroupRecipients(group)
    setSelectedGroupId('')
  }

  const addManualRecipient = () => {
    const email = manualEmail.trim().toLowerCase()
    if (!email.includes('@')) return
    const key = `email:${email}`
    if (recipientList.some((item) => item.key === key)) {
      setManualEmail('')
      setRecipientSelected(key, true)
      return
    }
    setRecipientList((current) => [
      ...current,
      { key, role: 'Manual', name: email, email },
    ])
    setSelectedRecipientKeys((current) => [...current, key])
    setManualEmail('')
  }

  const canSend = selectedRecipients.length > 0 && selectedFiles.length > 0 && Boolean(subject.trim())

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      const res = await fetch(`/api/calendar/manual/${eventId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          subject: subject.trim(),
          message: message.trim(),
          recipients: selectedRecipients.map((item) => ({
            name: item.name,
            email: item.email,
          })),
          files: selectedFiles.map((file) => ({
            key: file.key,
            url: file.url,
            name: displayCalendarFileName(file),
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(String(data?.error || 'No s’ha pogut enviar el correu'))
      }
      alert('Correu enviat correctament des d’Outlook.')
      onOpenChange(false)
    } catch (err) {
      console.error('Error enviant documents:', err)
      alert(err instanceof Error ? err.message : 'No s’ha pogut enviar el correu.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[94vw] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Mail className="h-4 w-4" />
            Enviar documents per correu
          </DialogTitle>
          <p className="text-sm text-slate-500">
            S’enviarà des del vostre compte Outlook amb els fitxers adjunts.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <Label>Assumpte</Label>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Missatge</Label>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-[96px]"
            />
          </div>

          <div className="space-y-2">
            <div>
              <Label>Documents a adjuntar</Label>
              <p className="mt-1 text-xs text-slate-500">
                Marqueu els documents de l’esdeveniment que voleu incloure al correu.
              </p>
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              {loadingFileNames ? (
                <p className="text-sm text-slate-500">Carregant noms dels documents…</p>
              ) : resolvedFiles.length === 0 ? (
                <p className="text-sm text-slate-500">No hi ha documents disponibles.</p>
              ) : (
                resolvedFiles.map((file) => {
                  const selected = selectedFileKeys.includes(file.key)
                  const inputId = `calendar-email-file-${file.key}`
                  return (
                    <label
                      key={file.key}
                      htmlFor={inputId}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                        selected
                          ? 'border-blue-300 bg-blue-50 text-blue-950'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => setFileSelected(file.key, event.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="min-w-0 flex-1 truncate" title={displayCalendarFileName(file)}>
                        {displayCalendarFileName(file)}
                      </span>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Afegir grup d’enviament</Label>
                {canManageMailGroups ? (
                  <Link
                    href={CALENDAR_MAIL_GROUPS_PATH}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    Gestionar grups
                  </Link>
                ) : null}
              </div>
              <div className="flex items-end gap-2">
                <select
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={loadingMailGroups || mailGroups.length === 0}
                >
                  <option value="">
                    {loadingMailGroups
                      ? 'Carregant grups…'
                      : mailGroups.length === 0
                        ? 'No hi ha grups disponibles'
                        : 'Selecciona un grup'}
                  </option>
                  {mailGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.members.length})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedGroupId}
                  onClick={addSelectedGroup}
                >
                  Afegir grup
                </Button>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-2">
                <Label>Afegir correu manual</Label>
                <Input
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="nom@empresa.com"
                />
              </div>
              <Button type="button" variant="outline" onClick={addManualRecipient}>
                Afegir
              </Button>
            </div>

            <div className="space-y-2">
              <div>
                <Label>Destinataris</Label>
                <p className="mt-1 text-xs text-slate-500">
                  Marqueu qui ha de rebre el correu o elimineu destinataris de la llista.
                </p>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                {loadingRecipients ? (
                  <p className="text-sm text-slate-500">Carregant destinataris…</p>
                ) : recipientList.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No hi ha destinataris. Afegiu un correu manual.
                  </p>
                ) : (
                  recipientList.map((recipient) => {
                    const selected = selectedRecipientKeys.includes(recipient.key)
                    const inputId = `calendar-email-recipient-${recipient.key}`
                    return (
                      <div
                        key={recipient.key}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                          selected
                            ? 'border-blue-300 bg-blue-50 text-blue-950'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            setRecipientSelected(recipient.key, event.target.checked)
                          }
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                          <span className="block truncate font-medium">
                            {recipient.name || recipient.email}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {recipient.role} · {recipient.email}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRecipient(recipient.key)}
                          className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Eliminar ${recipient.name || recipient.email}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="text-sm text-slate-500">
            {selectedRecipients.length} destinatari
            {selectedRecipients.length === 1 ? '' : 's'} · {selectedFiles.length} document
            {selectedFiles.length === 1 ? '' : 's'}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel·lar
            </Button>
            <Button
              type="button"
              disabled={!canSend || sending}
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void handleSend()}
            >
              {sending ? 'Enviant…' : 'Enviar per Outlook'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
