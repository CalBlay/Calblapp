'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEPARTMENTS } from '@/data/departments'
import { DOCUMENTACIO_ROLE_OPTIONS } from '@/lib/documentacio-access'
import {
  DOCUMENTACIO_AMBITS,
  findTopicInAmbit,
  getGroupsForAmbit,
  isStaticDocumentacioAmbit,
  isValidDocumentacioAmbitSlug,
  isValidDocumentacioTopicSlug,
  slugifyDocumentacioTopicTitle,
} from '@/lib/documentacio-structure'
import { cn } from '@/lib/utils'

type Kind = 'file' | 'link'

const NEW_TOPIC_SELECT = '__new_topic__'
const NEW_AMBIT_SELECT = '__new_ambit__'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Omple àmbit i tema quan s'obre (p. ex. des de la fitxa de tema). */
  prefAmbit?: string | null
  prefTopicSlug?: string | null
}

export function DocumentacioPublishDialog({
  open,
  onOpenChange,
  prefAmbit,
  prefTopicSlug,
}: Props) {
  const [ambit, setAmbit] = useState<string>('formacions')
  const [topicSlug, setTopicSlug] = useState('')
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<Kind>('file')
  const [href, setHref] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [departments, setDepartments] = useState<string[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [status, setStatus] = useState<'published' | 'draft'>('published')
  const [reviewAt, setReviewAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [extraAmbits, setExtraAmbits] = useState<Array<{ slug: string; title: string }>>([])
  const [extraTopics, setExtraTopics] = useState<Array<{ slug: string; title: string }>>([])
  const [newAmbitTitle, setNewAmbitTitle] = useState('')
  const [newAmbitSlug, setNewAmbitSlug] = useState('')
  const [newAmbitSlugTouched, setNewAmbitSlugTouched] = useState(false)
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [newTopicSlug, setNewTopicSlug] = useState('')
  const [newTopicSlugTouched, setNewTopicSlugTouched] = useState(false)

  const resolvedAmbitForData = useMemo(() => {
    if (ambit === NEW_AMBIT_SELECT) {
      return isValidDocumentacioAmbitSlug(newAmbitSlug) ? newAmbitSlug : null
    }
    return isValidDocumentacioAmbitSlug(ambit) ? ambit : null
  }, [ambit, newAmbitSlug])

  const topicsFlat = useMemo(() => {
    if (!resolvedAmbitForData) return []
    return getGroupsForAmbit(resolvedAmbitForData).flatMap((g) =>
      g.topics.map((t) => ({ slug: t.slug, title: t.title }))
    )
  }, [resolvedAmbitForData])

  const topicOptionSlugs = useMemo(() => {
    const fromStatic = topicsFlat.map((t) => t.slug)
    const fromExtra = extraTopics.map((t) => t.slug).filter((s) => !fromStatic.includes(s))
    return [...fromStatic, ...fromExtra]
  }, [topicsFlat, extraTopics])

  useEffect(() => {
    if (!open) return
    setError(null)
    if (prefAmbit && isValidDocumentacioAmbitSlug(prefAmbit)) {
      setAmbit(prefAmbit)
    }
  }, [open, prefAmbit])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/documentacio/ambits')
        const data = (await r.json()) as { extraAmbits?: Array<{ slug: string; title: string }> }
        if (cancelled) return
        setExtraAmbits(Array.isArray(data.extraAmbits) ? data.extraAmbits : [])
      } catch {
        if (!cancelled) setExtraAmbits([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open || !resolvedAmbitForData) {
      setExtraTopics([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/documentacio/topics?ambit=${encodeURIComponent(resolvedAmbitForData)}`)
        const data = (await r.json()) as { extraTopics?: Array<{ slug: string; title: string }> }
        if (cancelled) return
        setExtraTopics(Array.isArray(data.extraTopics) ? data.extraTopics : [])
      } catch {
        if (!cancelled) setExtraTopics([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, resolvedAmbitForData])

  useEffect(() => {
    if (!open) return
    if (ambit === NEW_AMBIT_SELECT) {
      setTopicSlug(NEW_TOPIC_SELECT)
      return
    }
    const preferred =
      prefTopicSlug && topicOptionSlugs.includes(prefTopicSlug) ? prefTopicSlug : null
    setTopicSlug((current) => {
      if (preferred) return preferred
      if (current === NEW_TOPIC_SELECT) return current
      if (current && topicOptionSlugs.includes(current)) return current
      return topicOptionSlugs[0] ?? ''
    })
  }, [open, ambit, prefTopicSlug, topicOptionSlugs])

  useEffect(() => {
    if (ambit !== NEW_AMBIT_SELECT || newAmbitSlugTouched) return
    setNewAmbitSlug(slugifyDocumentacioTopicTitle(newAmbitTitle))
  }, [ambit, newAmbitTitle, newAmbitSlugTouched])

  useEffect(() => {
    if (topicSlug !== NEW_TOPIC_SELECT || newTopicSlugTouched) return
    setNewTopicSlug(slugifyDocumentacioTopicTitle(newTopicTitle))
  }, [topicSlug, newTopicTitle, newTopicSlugTouched])

  function toggleDept(d: string) {
    setDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  function toggleRole(r: string) {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }

  function selectAllDepartments() {
    setDepartments([...DEPARTMENTS])
  }

  function selectAllRoles() {
    setRoles(DOCUMENTACIO_ROLE_OPTIONS.map((o) => o.value))
  }

  function resetForClose() {
    setAmbit('formacions')
    setTopicSlug('')
    setLabel('')
    setKind('file')
    setHref('')
    setFile(null)
    setDepartments([])
    setRoles([])
    setStatus('published')
    setReviewAt('')
    setError(null)
    setFileKey((k) => k + 1)
    setNewTopicTitle('')
    setNewTopicSlug('')
    setNewTopicSlugTouched(false)
    setNewAmbitTitle('')
    setNewAmbitSlug('')
    setNewAmbitSlugTouched(false)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    let finalAmbit = ambit
    let ambitTitleField: string | undefined

    if (ambit === NEW_AMBIT_SELECT) {
      finalAmbit = newAmbitSlug.trim()
      if (!newAmbitTitle.trim()) {
        setError('Introdueix el títol de l’àmbit nou.')
        return
      }
      if (!isValidDocumentacioAmbitSlug(finalAmbit)) {
        setError(
          'L’identificador de l’àmbit ha de ser en minúscules, sense espais (ex.: qualitat).'
        )
        return
      }
      if (!isStaticDocumentacioAmbit(finalAmbit)) {
        ambitTitleField = newAmbitTitle.trim()
      }
    } else if (!isValidDocumentacioAmbitSlug(ambit)) {
      setError('Selecciona un àmbit vàlid.')
      return
    }

    let finalTopicSlug = topicSlug
    let topicTitleField: string | undefined

    if (topicSlug === NEW_TOPIC_SELECT) {
      finalTopicSlug = newTopicSlug.trim()
      if (!newTopicTitle.trim()) {
        setError('Introdueix el títol del tema nou.')
        return
      }
      if (!isValidDocumentacioTopicSlug(finalTopicSlug)) {
        setError(
          'L’identificador del tema ha de ser en minúscules, sense espais (ex.: seguretat-alimentaria).'
        )
        return
      }
      if (!findTopicInAmbit(finalAmbit, finalTopicSlug)) {
        topicTitleField = newTopicTitle.trim()
      }
    } else if (!topicSlug) {
      setError('Selecciona un tema.')
      return
    }

    if (!label.trim()) {
      setError('Cal un títol visible.')
      return
    }
    if (kind === 'link' && !/^https?:\/\//i.test(href.trim())) {
      setError('URL no vàlida (ha de començar per http o https).')
      return
    }
    if (kind === 'file' && (!file || file.size === 0)) {
      setError('Selecciona un fitxer.')
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('ambit', finalAmbit)
      if (ambitTitleField) fd.append('ambitTitle', ambitTitleField)
      fd.append('topicSlug', finalTopicSlug)
      if (topicTitleField) fd.append('topicTitle', topicTitleField)
      fd.append('label', label.trim())
      fd.append('kind', kind)
      if (kind === 'link') fd.append('href', href.trim())
      if (kind === 'file' && file) fd.append('file', file)
      fd.append('status', status)
      if (reviewAt.trim()) fd.append('reviewAt', reviewAt.trim())
      fd.append('departments', JSON.stringify(departments))
      fd.append('roles', JSON.stringify(roles))

      const res = await fetch('/api/documentacio/items', { method: 'POST', body: fd })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error || "No s'ha pogut publicar.")
        return
      }
      resetForClose()
      onOpenChange(false)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('documentacio:items-changed'))
    } catch {
      setError('Error de xarxa.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForClose()
        onOpenChange(v)
      }}
    >
      <DialogContent
        className="max-h-[90vh] max-w-lg gap-3 overflow-y-auto sm:max-w-xl"
        lockDismissOnOutside
      >
        <DialogHeader className="space-y-0">
          <DialogTitle>Publicar document</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Àmbit</Label>
              <Select
                value={ambit}
                onValueChange={(v) => {
                  setAmbit(v)
                  setNewTopicTitle('')
                  setNewTopicSlug('')
                  setNewTopicSlugTouched(false)
                  setNewAmbitTitle('')
                  setNewAmbitSlug('')
                  setNewAmbitSlugTouched(false)
                  if (v !== NEW_AMBIT_SELECT) {
                    const next = getGroupsForAmbit(v).flatMap((g) => g.topics)
                    setTopicSlug(next[0]?.slug ?? '')
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENTACIO_AMBITS.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.title}
                    </SelectItem>
                  ))}
                  {extraAmbits
                    .filter((a) => !DOCUMENTACIO_AMBITS.some((s) => s.id === a.slug))
                    .map((a) => (
                      <SelectItem key={`extra-ambit-${a.slug}`} value={a.slug}>
                        {a.title}
                      </SelectItem>
                    ))}
                  <SelectItem value={NEW_AMBIT_SELECT}>+ Àmbit nou…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tema</Label>
              <Select
                value={topicSlug}
                disabled={ambit === NEW_AMBIT_SELECT}
                onValueChange={(v) => {
                  setTopicSlug(v)
                  setNewTopicTitle('')
                  setNewTopicSlug('')
                  setNewTopicSlugTouched(false)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={ambit === NEW_AMBIT_SELECT ? 'Tema nou (requerit)' : 'Tema'} />
                </SelectTrigger>
                <SelectContent>
                  {topicsFlat.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.title}
                    </SelectItem>
                  ))}
                  {extraTopics
                    .filter((t) => !topicsFlat.some((s) => s.slug === t.slug))
                    .map((t) => (
                      <SelectItem key={`extra-${t.slug}`} value={t.slug}>
                        {t.title}
                      </SelectItem>
                    ))}
                  <SelectItem value={NEW_TOPIC_SELECT}>+ Tema nou…</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {ambit === NEW_AMBIT_SELECT ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doc-new-ambit-title">Títol de l’àmbit nou</Label>
                <Input
                  id="doc-new-ambit-title"
                  value={newAmbitTitle}
                  onChange={(e) => setNewAmbitTitle(e.target.value)}
                  placeholder="Ex.: Qualitat"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doc-new-ambit-slug">Identificador d’àmbit (URL)</Label>
                <Input
                  id="doc-new-ambit-slug"
                  value={newAmbitSlug}
                  onChange={(e) => {
                    setNewAmbitSlugTouched(true)
                    setNewAmbitSlug(e.target.value)
                  }}
                  placeholder="qualitat"
                  className="font-mono text-sm"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500">
                  Es genera sol a partir del títol; pots editar-lo (minúscules i guions). El tema serà nou en
                  aquest àmbit.
                </p>
              </div>
            </div>
          ) : null}

          {topicSlug === NEW_TOPIC_SELECT ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doc-new-topic-title">Títol del tema nou</Label>
                <Input
                  id="doc-new-topic-title"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  placeholder="Ex.: Seguretat alimentària"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doc-new-topic-slug">Identificador (URL)</Label>
                <Input
                  id="doc-new-topic-slug"
                  value={newTopicSlug}
                  onChange={(e) => {
                    setNewTopicSlugTouched(true)
                    setNewTopicSlug(e.target.value)
                  }}
                  placeholder="seguretat-alimentaria"
                  className="font-mono text-sm"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500">
                  Es genera sol a partir del títol; pots editar-lo (minúscules i guions).
                </p>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="doc-label">Títol visible</Label>
            <Input
              id="doc-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Guia d’acollida"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="shrink-0 space-y-1.5">
              <Label>Tipus</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={kind === 'file' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(kind === 'file' && 'bg-teal-600 hover:bg-teal-700')}
                  onClick={() => setKind('file')}
                >
                  Fitxer
                </Button>
                <Button
                  type="button"
                  variant={kind === 'link' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(kind === 'link' && 'bg-teal-600 hover:bg-teal-700')}
                  onClick={() => setKind('link')}
                >
                  Enllaç
                </Button>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {kind === 'link' ? (
                <>
                  <Label htmlFor="doc-href">URL</Label>
                  <Input
                    id="doc-href"
                    value={href}
                    onChange={(e) => setHref(e.target.value)}
                    placeholder="https://…"
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="doc-file">Fitxer (màx. 20 MB)</Label>
                  <Input
                    key={fileKey}
                    id="doc-file"
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Estat</Label>
              <Select value={status} onValueChange={(v) => setStatus(v === 'draft' ? 'draft' : 'published')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Publicat</SelectItem>
                  <SelectItem value="draft">Esborrany</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-review">Data revisió (opcional)</Label>
              <Input id="doc-review" type="date" value={reviewAt} onChange={(e) => setReviewAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <Label>Departaments (opcional)</Label>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-teal-700 hover:text-teal-800"
                  onClick={selectAllDepartments}
                >
                  Seleccionar tot
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setDepartments([])}
                >
                  Netejar
                </Button>
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200 p-3 text-sm sm:max-h-64">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 rounded border-slate-300"
                      checked={departments.includes(d)}
                      onChange={() => toggleDept(d)}
                    />
                    <span>{d}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <Label>Rols (opcional)</Label>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-teal-700 hover:text-teal-800"
                  onClick={selectAllRoles}
                >
                  Seleccionar tot
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setRoles([])}
                >
                  Netejar
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DOCUMENTACIO_ROLE_OPTIONS.map((r) => (
                  <label key={r.value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 rounded border-slate-300"
                      checked={roles.includes(r.value)}
                      onChange={() => toggleRole(r.value)}
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel·lar
            </Button>
            <Button type="submit" disabled={submitting} className="bg-teal-600 hover:bg-teal-700">
              {submitting ? 'Publicant…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
