'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Save, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type ProjectData } from './project-shared'
import { projectCardTitleClass, projectEmptyStateClass } from './project-ui'

const CATEGORY_ALIASES: Record<string, string[]> = {
  initial: ['initial', 'inicial', 'inicials', 'overview', 'document inicial', 'docs inicials'],
  kickoff: ['kickoff', 'arrencada', 'reunio', 'reunio kickoff', 'convocatoria', 'acta'],
  general: ['general', 'projecte general', 'projecte', 'operatiu', 'operatius', 'docs operatius'],
  block: ['block', 'bloc', 'blocs', 'front', 'fronts'],
  other: ['other', 'altre', 'altres', 'varis', 'misc'],
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const tokenize = (value: string) =>
  normalizeText(value)
    .split(/[\s,.;:/\\|()[\]_-]+/)
    .filter(Boolean)

const isSubsequence = (needle: string, haystack: string) => {
  let pointer = 0
  for (const char of haystack) {
    if (char === needle[pointer]) pointer += 1
    if (pointer === needle.length) return true
  }
  return needle.length === 0
}

const levenshteinDistance = (a: string, b: string) => {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[rows - 1][cols - 1]
}

const matchesSmartToken = (term: string, corpus: string, tokens: string[]) => {
  if (!term) return true
  if (corpus.includes(term)) return true
  if (tokens.some((token) => token.startsWith(term) || term.startsWith(token))) return true
  if (term.length >= 4 && isSubsequence(term, corpus.replace(/\s+/g, ''))) return true
  if (
    term.length >= 4 &&
    tokens.some(
      (token) => token.length >= 4 && Math.abs(token.length - term.length) <= 2 && levenshteinDistance(token, term) <= 1
    )
  ) {
    return true
  }
  return false
}

const formatDateTime = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatTime = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('ca-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Props = {
  project: ProjectData
  savingOverview: boolean
  pendingDocumentFile: File | null
  documentDraft: { category: string; label: string }
  onSave: () => void
  onPendingFileChange: (file: File | null) => void
  onDocumentDraftChange: (updater: (current: { category: string; label: string }) => { category: string; label: string }) => void
  onRemoveDocument: (
    documentId: string,
    source?: {
      type: 'project' | 'room' | 'task'
      roomId?: string
      blockId?: string
      taskId?: string
    }
  ) => void
  onRemoveKickoffMinutes: () => void
}

export default function ProjectDocumentsTab({
  project,
  savingOverview,
  pendingDocumentFile,
  documentDraft,
  onSave,
  onPendingFileChange,
  onDocumentDraftChange,
  onRemoveDocument,
  onRemoveKickoffMinutes,
}: Props) {
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState<'initial' | 'operational'>('initial')
  const [fileInputKey, setFileInputKey] = useState(0)
  const previousPendingFile = useRef<File | null>(null)
  const [kickoffMinutesUrl, setKickoffMinutesUrl] = useState('')
  const sectionCategories =
    activeSection === 'initial' ? ['initial', 'kickoff'] : ['general', 'block', 'other']
  const defaultCategory = activeSection === 'initial' ? 'initial' : 'general'

  useEffect(() => {
    if (sectionCategories.includes(documentDraft.category)) return
    onDocumentDraftChange((current) => ({
      ...current,
      category: sectionCategories.includes(current.category) ? current.category : defaultCategory,
    }))
  }, [activeSection, defaultCategory, documentDraft.category, onDocumentDraftChange])

  useEffect(() => {
    if (previousPendingFile.current && !pendingDocumentFile) {
      setFileInputKey((current) => current + 1)
    }
    previousPendingFile.current = pendingDocumentFile
  }, [pendingDocumentFile])

  const kickoffMinutesContent = useMemo(() => {
    const minutes = String(project.kickoff?.minutes || '').trim()
    if (!minutes) return ''
    const attendees = project.kickoff?.attendees || []
    const allAttendees = attendees.map((item) => item.name)
    const absentAttendees = attendees.filter((item) => item.attended === false).map((item) => item.name)
    const presentAttendees = attendees
      .filter((item) => item.attended !== false)
      .map((item) => item.name)

    return [
      `Projecte: ${project.name || 'Sense nom'}`,
      `Data de la reunió d'arrencada: ${
        project.kickoff?.date ? project.kickoff.date.split('-').reverse().join('/') : 'Sense data'
      }`,
      `Hora de la reunió d'arrencada: ${project.kickoff?.startTime || 'Sense hora'}`,
      `Hora final acta: ${formatTime(project.kickoff?.minutesClosedAt) || 'Sense hora final'}`,
      `Acta redactada per: ${project.kickoff?.minutesAuthor || 'Sense usuari'}`,
      `Última actualització: ${formatDateTime(project.kickoff?.minutesUpdatedAt) || 'Sense registre'}`,
      `Assistents: ${presentAttendees.length > 0 ? presentAttendees.join('; ') : 'Sense assistents'}`,
      `Absents: ${absentAttendees.length > 0 ? absentAttendees.join('; ') : 'Cap'}`,
      '',
      "ACTA DE LA REUNIÓ D'ARRENCADA",
      '',
      minutes,
    ].join('\n')
  }, [
    project.kickoff?.date,
    project.kickoff?.minutes,
    project.kickoff?.minutesAuthor,
    project.kickoff?.minutesClosedAt,
    project.kickoff?.minutesUpdatedAt,
    project.kickoff?.startTime,
    project.name,
  ])

  useEffect(() => {
    if (!kickoffMinutesContent) {
      setKickoffMinutesUrl('')
      return
    }

    const blob = new Blob([kickoffMinutesContent], { type: 'text/plain;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    setKickoffMinutesUrl(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [kickoffMinutesContent])

  const kickoffMinutesDocument = useMemo(() => {
    const minutes = String(project.kickoff?.minutes || '').trim()
    if (!minutes || !kickoffMinutesUrl) return null

    return {
      id: 'kickoff-minutes',
      category: 'kickoff',
      label: "Acta de la reunió d'arrencada",
      name: "Acta-reunio-arrencada.txt",
      path: '',
      url: kickoffMinutesUrl,
    }
  }, [kickoffMinutesUrl, project.kickoff?.minutes])

  const taskDocuments = useMemo(
    () =>
      (project.blocks || []).flatMap((block) =>
        (block.tasks || []).flatMap((task) =>
          (task.documents || [])
            .filter(Boolean)
            .map((document) => ({
              ...document,
              category: document?.category || 'block',
              label: document?.label || task.title || block.name || 'Tasca',
              _originType: 'task' as const,
              _originBlockId: block.id,
              _originTaskId: task.id,
              _sourceBlock: block.name || '',
              _sourceTask: task.title || '',
            }))
        )
      ),
    [project.blocks]
  )

  const roomDocuments = useMemo(
    () =>
      (project.rooms || []).flatMap((room) =>
        (room.documents || [])
          .filter(Boolean)
          .map((document) => ({
            ...document,
            category: document?.category || 'other',
            label: document?.label || room.name || 'Sala',
            _originType: 'room' as const,
            _originRoomId: room.id,
            _sourceRoom: room.name || '',
          }))
      ),
    [project.rooms]
  )

  const allVisibleSources = useMemo(() => {
    const projectDocuments = (project.documents || []).map((document) => ({
      ...document,
      _originType: 'project' as const,
    }))
    const merged = [...projectDocuments, ...taskDocuments, ...roomDocuments, kickoffMinutesDocument].filter(Boolean)
    const seen = new Set<string>()
    return merged.filter((item) => {
      const key = String(item?.id || item?.url || item?.path || `${item?.name}-${item?.label}`)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [kickoffMinutesDocument, project.documents, roomDocuments, taskDocuments])

  const filteredDocuments = useMemo(() => {
    const terms = tokenize(search)
    const sectionTerms =
      activeSection === 'initial'
        ? ['initial', 'inicial', 'docs inicials', 'overview', 'kickoff', 'arrencada']
        : ['operational', 'operatiu', 'operatius', 'docs operatius', 'bloc', 'general', 'altres']

    return allVisibleSources.filter((item) => {
      if (!item) return false

      const category = item.category || ''
      if (!sectionCategories.includes(category)) return false
      if (terms.length === 0) return true

      const aliases = CATEGORY_ALIASES[category] || []
      const source = [
        item.label || '',
        item.name || '',
        category,
        String((item as { _sourceRoom?: string })._sourceRoom || ''),
        String((item as { _sourceBlock?: string })._sourceBlock || ''),
        String((item as { _sourceTask?: string })._sourceTask || ''),
        ...aliases,
        ...sectionTerms,
      ].join(' ')

      const corpus = normalizeText(source)
      const tokens = tokenize(source)

      return terms.every((term) => matchesSmartToken(term, corpus, tokens))
    })
  }, [activeSection, allVisibleSources, search, sectionCategories])

  const handleSectionChange = (nextSection: 'initial' | 'operational') => {
    setActiveSection(nextSection)
    setSearch('')
    onPendingFileChange(null)
  }

  return (
    <section className="space-y-5 rounded-[24px] bg-white/75 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSectionChange('initial')}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeSection === 'initial'
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Docs inicials
            </button>
            <button
              type="button"
              onClick={() => handleSectionChange('operational')}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeSection === 'operational'
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Docs operatius
            </button>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[640px] xl:flex-row xl:items-end xl:justify-end">
          <div className="flex-1 space-y-2 xl:min-w-[320px]">
            <Label>Cercar documents</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cercar per nom, etapa, tipus o categoria"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2 xl:min-w-[280px]">
            <Label>Adjuntar arxiu</Label>
            <Input
              key={fileInputKey}
              type="file"
              onChange={(event) => onPendingFileChange(event.target.files?.[0] || null)}
            />
          </div>

          <Button
            type="button"
            onClick={onSave}
            disabled={!pendingDocumentFile || savingOverview}
            className="h-11 min-w-[220px] bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-300"
          >
            <Save className="mr-2 h-4 w-4" />
            Adjuntar arxiu
          </Button>
        </div>
      </div>

      {pendingDocumentFile ? (
        <div className="rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
          Arxiu seleccionat: {pendingDocumentFile.name}
        </div>
      ) : null}

      <div className="space-y-2">
        {filteredDocuments.length === 0 ? (
          <div className={`rounded-2xl bg-slate-50/80 px-4 py-4 ${projectEmptyStateClass}`}>
            {search.trim()
              ? 'No hi ha documents que coincideixin amb la cerca.'
              : 'Encara no hi ha documents al projecte.'}
          </div>
        ) : (
          filteredDocuments.map((item) => (
            <div
              key={item?.id || item?.path || item?.url}
              className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50/70 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                  <FileText className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  {item?.url ? (
                    <Link
                      href={item.url}
                      target="_blank"
                      className={`block truncate hover:text-violet-700 ${projectCardTitleClass}`}
                    >
                      {item?.name || item?.label || 'Document'}
                    </Link>
                  ) : (
                    <div className={`truncate ${projectCardTitleClass}`}>
                      {item?.name || item?.label || 'Document'}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {item?.label && item?.label !== item?.name ? <span>{item.label}</span> : null}
                    {item?.category ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {item.category}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {item?.id === 'kickoff-minutes' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={onRemoveKickoffMinutes}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() =>
                        item?.id &&
                        onRemoveDocument(item.id, {
                          type: (item as { _originType?: 'project' | 'room' | 'task' })._originType || 'project',
                          roomId: (item as { _originRoomId?: string })._originRoomId,
                          blockId: (item as { _originBlockId?: string })._originBlockId,
                          taskId: (item as { _originTaskId?: string })._originTaskId,
                        })
                      }
                      disabled={!item?.id}
                    >
                      <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                </div>
              </div>
          ))
        )}
      </div>
    </section>
  )
}

