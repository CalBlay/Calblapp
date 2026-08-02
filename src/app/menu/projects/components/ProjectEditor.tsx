'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Flag, Layers3, Paperclip, UsersRound } from 'lucide-react'
import { DEPARTMENTS } from '@/data/departments'
import { Button } from '@/components/ui/button'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { compressRasterImageForUpload } from '@/lib/file-optimization'
import ProjectKickoffTab from './ProjectKickoffTab'
import ProjectOverviewTab from './ProjectOverviewTab'
import { ensureProjectRooms } from './project-workspace-state'
import { EMPTY_KICKOFF, deriveProjectPhase, type ProjectData } from './project-shared'
import { useProjectBlocksTasksActions } from './useProjectBlocksTasksActions'
import { useProjectKickoffActions } from './useProjectKickoffActions'
import { useProjectAutoSync } from './useProjectAutoSync'
import { useProjectUsersCatalog } from './useProjectUsersCatalog'
import { createBlockDraft, createTaskDraft, normalizeDepartment } from './project-workspace-helpers'

const todayKey = () => new Date().toISOString().slice(0, 10)

const emptyProject: ProjectData = {
  id: '',
  name: '',
  sponsor: '',
  owner: '',
  ownerUserId: '',
  createdById: '',
  context: '',
  strategy: '',
  risks: '',
  startDate: todayKey(),
  launchDate: '',
  budget: '',
  departments: [],
  phase: 'definition',
  status: 'definition',
  blocks: [],
  sprints: [],
  rooms: [],
  document: null,
  documents: [],
  kickoff: EMPTY_KICKOFF,
}

const noopSaveProject = async () => null

export default function ProjectEditor() {
  const router = useRouter()
  const { data: session } = useSession()
  const [project, setProject] = useState<ProjectData>(emptyProject)
  const [draftId, setDraftId] = useState('')
  const { usersCatalog, responsibles } = useProjectUsersCatalog()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [blockDraft, setBlockDraft] = useState(createBlockDraft())
  const [taskDraft, setTaskDraft] = useState(createTaskDraft())
  const [manualKickoffEmail, setManualKickoffEmail] = useState('')
  const [showBlockComposer, setShowBlockComposer] = useState(false)
  const [, setShowTaskComposer] = useState(false)
  const [, setQuickTaskBlockId] = useState<string | null>(null)
  const [, setEditingBlockId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingKickoff, setSendingKickoff] = useState(false)
  const [savingBlocks, setSavingBlocks] = useState(false)
  const [autosaving, setAutosaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null)
  const compactFileInputId = 'project-document-compact'
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSnapshotRef = useRef('')
  const initialDocuments = useMemo(
    () => (project.documents || []).filter((item) => item && item.category === 'initial'),
    [project.documents]
  )

  useEffect(() => {
    const sessionUserName = String(session?.user?.name || '').trim()
    if (!sessionUserName) return

    setProject((current) =>
      current.sponsor === sessionUserName || current.sponsor.trim()
        ? current
        : { ...current, sponsor: sessionUserName }
    )
  }, [session?.user?.name])

  const ownerOptions = useMemo(() => {
    if (project.owner && !responsibles.some((item) => item.name === project.owner)) {
      return [
        { id: 'current', name: project.owner, role: 'current', email: '', department: '' },
        ...responsibles,
      ]
    }
    return responsibles
  }, [project.owner, responsibles])

  const userByName = useMemo(() => new Map(usersCatalog.map((user) => [user.name, user])), [usersCatalog])

  useProjectAutoSync({
    project,
    setProject,
    usersCatalog,
    userByName,
  })

  const availableDepartments = useMemo(
    () =>
      DEPARTMENTS.filter((department) => {
        const normalized = normalizeDepartment(department)
        return normalized !== 'delsys' && normalized !== 'total'
      }),
    []
  )

  const { setKickoffField, removeKickoffAttendee, addManualKickoffEmail } = useProjectKickoffActions({
    projectId: '__new__',
    project,
    setProject,
    manualKickoffEmail,
    setManualKickoffEmail,
    setSendingKickoff,
    setSavingBlocks,
    saveProject: noopSaveProject,
    ensureProjectRooms: (currentProject) => ensureProjectRooms(currentProject, userByName),
    sessionUserName: String(session?.user?.name || ''),
    onBlocksDirty: () => undefined,
  })

  const kickoffReady =
    Boolean(project.kickoff.date) &&
    Boolean(project.kickoff.startTime) &&
    Number(project.kickoff.durationMinutes) > 0 &&
    project.kickoff.attendees.some((item) => item.email.includes('@'))

  const { createBlock, setBlockField, removeBlock, addDepartmentToBlock, removeDepartmentFromBlock } =
    useProjectBlocksTasksActions({
      project,
      blockDraft,
      taskDraft,
      setProject,
      setBlockDraft,
      setTaskDraft,
      setShowBlockComposer,
      setShowTaskComposer,
      setQuickTaskBlockId,
      setEditingBlockId,
      setSavingBlocks,
      saveProject: noopSaveProject,
      ensureProjectRooms: (currentProject) => ensureProjectRooms(currentProject, userByName),
      onBlocksStateSaved: setProject,
      onBlocksDirty: () => undefined,
    })

  const canContinue = Boolean(project.name.trim() && project.owner.trim() && project.strategy.trim() && project.launchDate)
  const hasMeaningfulContent = Boolean(
    project.name.trim() ||
      project.owner.trim() ||
      project.strategy.trim() ||
      project.launchDate ||
      project.blocks.length > 0 ||
      project.departments.length > 0 ||
      project.kickoff.date ||
      project.kickoff.startTime ||
      project.kickoff.notes.trim() ||
      project.kickoff.attendees.length > 0 ||
      pendingFile
  )

  const setProjectField = <K extends keyof ProjectData>(field: K, value: ProjectData[K]) => {
    setProject((current) => ({ ...current, [field]: value }))
  }

  const setProjectObjectives = (value: string) => {
    setProject((current) => ({
      ...current,
      context: value,
      strategy: value,
    }))
  }

  const buildForm = useCallback(
    (status: '' | 'draft') => {
      const form = new FormData()
      form.set('name', project.name)
      form.set('sponsor', project.sponsor)
      form.set('owner', project.owner)
      form.set('context', project.strategy)
      form.set('strategy', project.strategy)
      form.set('risks', '')
      form.set('launchDate', project.launchDate)
      form.set('budget', '')
      form.set('phase', deriveProjectPhase(project))
      form.set('status', status)
      form.set('departments', JSON.stringify(project.departments))
      form.set('blocks', JSON.stringify(project.blocks))
      form.set('sprints', JSON.stringify(project.sprints || []))
      form.set('rooms', JSON.stringify(project.rooms))
      form.set('documents', JSON.stringify(project.documents || []))
      form.set('kickoff', JSON.stringify(project.kickoff))
      if (pendingFile) {
        form.set('file', pendingFile)
        form.set('fileLabel', 'Document inicial')
      }
      return form
    },
    [pendingFile, project]
  )

  const applyStoredDocument = useCallback((document?: ProjectData['document']) => {
    if (!document) return
    setProject((current) => {
      const alreadyExists = current.documents.some((item) => item?.id && item.id === document?.id)
      return {
        ...current,
        document,
        documents: alreadyExists ? current.documents : [...current.documents, document],
      }
    })
  }, [])

  const persistProject = useCallback(
    async (status: '' | 'draft', existingId?: string) => {
      const res = await fetch(existingId ? `/api/projects/${existingId}` : '/api/projects', {
        method: existingId ? 'PATCH' : 'POST',
        body: buildForm(status),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        id?: string
        error?: string
        document?: ProjectData['document']
      }
      if (!res.ok || (!existingId && !payload.id)) {
        throw new Error(payload.error || 'No s ha pogut guardar el projecte')
      }
      if (payload.document) {
        applyStoredDocument(payload.document)
        setPendingFile(null)
      }
      return { id: existingId || payload.id || '', document: payload.document || null }
    },
    [applyStoredDocument, buildForm]
  )

  const sendKickoffForProject = async (projectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/kickoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: project.kickoff.date,
        startTime: project.kickoff.startTime,
        durationMinutes: project.kickoff.durationMinutes,
        notes: project.kickoff.notes,
        excludedKeys: project.kickoff.excludedKeys,
        attendees: project.kickoff.attendees,
      }),
    })

    const contentType = res.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? ((await res.json().catch(() => null)) as { error?: string; warning?: string } | null)
      : ({
          error: (await res.text().catch(() => '')).trim() || `HTTP ${res.status}`,
        } as { error?: string; warning?: string })

    if (!res.ok) {
      throw new Error(payload?.error || `No s'ha pogut crear la convocatoria (${res.status})`)
    }

    return payload?.warning || ''
  }

  const handleCreateProject = async () => {
    try {
      setSaving(true)
      setFeedback(null)
      const { id } = await persistProject('', draftId || undefined)
      if (!draftId) setDraftId(id)
      lastSavedSnapshotRef.current = ''
      setFeedback({ type: 'success', message: 'Projecte creat correctament.' })
      toast({ title: 'Projecte creat' })
      router.replace(`/menu/projects/${id}`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error guardant el projecte'
      setFeedback({ type: 'error', message })
      toast({ title: 'Error guardant el projecte', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAndSendKickoff = async () => {
    try {
      setSendingKickoff(true)
      setFeedback(null)
      const { id } = await persistProject('', draftId || undefined)
      if (!draftId) setDraftId(id)
      lastSavedSnapshotRef.current = ''
      const warning = await sendKickoffForProject(id)
      setFeedback({
        type: 'success',
        message: warning
          ? `Projecte creat i convocatoria enviada amb avis: ${warning}`
          : 'Projecte creat i convocatoria enviada correctament.',
      })
      toast({
        title: warning ? 'Convocatoria creada amb avis' : 'Convocatoria enviada',
        description: warning || undefined,
        variant: warning ? 'destructive' : 'default',
      })
      router.replace(`/menu/projects/${id}?tab=kickoff`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error enviant la convocatoria'
      setFeedback({ type: 'error', message })
      toast({ title: 'Error enviant la convocatoria', description: message, variant: 'destructive' })
    } finally {
      setSendingKickoff(false)
    }
  }

  useEffect(() => {
    if (!hasMeaningfulContent) return

    const snapshot = JSON.stringify({
      draftId,
      project: {
        name: project.name,
        sponsor: project.sponsor,
        owner: project.owner,
        strategy: project.strategy,
        launchDate: project.launchDate,
        departments: project.departments,
        blocks: project.blocks,
        rooms: project.rooms,
        documents: project.documents,
        kickoff: project.kickoff,
        sprints: project.sprints || [],
        phase: project.phase,
        status: project.status,
      },
      pendingFile: pendingFile ? { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type } : null,
    })

    if (snapshot === lastSavedSnapshotRef.current || saving || sendingKickoff) return

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          setAutosaving(true)
          const { id } = await persistProject('draft', draftId || undefined)
          setDraftId(id)
          setProject((current) => ({
            ...current,
            id,
            status: 'draft',
          }))
          lastSavedSnapshotRef.current = JSON.stringify({
            draftId: id,
            project: {
              name: project.name,
              sponsor: project.sponsor,
              owner: project.owner,
              strategy: project.strategy,
              launchDate: project.launchDate,
              departments: project.departments,
              blocks: project.blocks,
              rooms: project.rooms,
              documents: project.documents,
              kickoff: project.kickoff,
              sprints: project.sprints || [],
              phase: project.phase,
              status: 'draft',
            },
            pendingFile: null,
          })
        } catch (err: unknown) {
          toast({
            title: 'Error guardant l esborrany',
            description: err instanceof Error ? err.message : 'Error inesperat',
            variant: 'destructive',
          })
        } finally {
          setAutosaving(false)
        }
      })()
    }, 900)

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [draftId, hasMeaningfulContent, pendingFile, persistProject, project, saving, sendingKickoff])

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[30px] border border-violet-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.96))] shadow-[0_24px_60px_-34px_rgba(124,58,237,0.32)]">
          <div className="border-b border-violet-200/70 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm">
                <Flag className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-600">Pas 1</div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Dades essencials</h2>
                <p className="text-sm text-slate-500">Només el que cal per crear el projecte amb una base bona.</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-[28px] border border-violet-100 bg-white/95 p-5 shadow-[0_24px_44px_-28px_rgba(124,58,237,0.35)] sm:p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-violet-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-violet-700">
                    {autosaving ? 'Guardant esborrany...' : draftId ? 'Esborrany actiu' : 'Nou registre'}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-xs font-medium text-slate-600">
                    Deadline visible
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white/75 px-3 py-1 text-xs font-medium text-slate-600">
                    Objectius unificats
                  </span>
                </div>
                {project.launchDate ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Deadline</div>
                    <div className="mt-1 text-sm font-semibold text-amber-900">{project.launchDate}</div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="project-name" className="text-sm font-semibold text-slate-800">
                      Nom del projecte
                    </Label>
                    <Input
                      id="project-name"
                      value={project.name}
                      onChange={(event) => setProjectField('name', event.target.value)}
                      placeholder="Ex: Obertura nou espai"
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/70 px-4 text-base shadow-inner shadow-slate-100/70 transition focus:border-violet-300 focus:bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-800">Responsable de projecte</Label>
                    <select
                      value={project.owner || ''}
                      onChange={(event) => setProjectField('owner', event.target.value)}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                    >
                      <option value="">Selecciona responsable</option>
                      {ownerOptions.map((option) => (
                        <option key={`${option.id}-${option.name}`} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(248,250,252,0.9),rgba(255,255,255,0.95))] p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Objectiu del pas</div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Aquesta primera pantalla ha de ser ràpida: identificar, responsabilitzar i fixar un horitzó clar.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="project-launch-date" className="text-sm font-semibold text-slate-800">
                      Data deadline
                    </Label>
                    <Input
                      id="project-launch-date"
                      type="date"
                      value={project.launchDate}
                      onChange={(event) => setProjectField('launchDate', event.target.value)}
                      className="h-12 rounded-2xl border-slate-200 bg-slate-50/70 px-4 shadow-inner shadow-slate-100/70 transition focus:border-violet-300 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="project-strategy" className="text-sm font-semibold text-slate-800">
                      Objectius del projecte
                    </Label>
                    <span className="text-xs font-medium text-slate-400">{project.strategy.trim().length} caracters</span>
                  </div>
                  <Textarea
                    id="project-strategy"
                    value={project.strategy}
                    onChange={(event) => setProjectObjectives(event.target.value)}
                    placeholder="Quin resultat volem assolir, quina necessitat cobreix i quin context te aquest projecte?"
                    className="min-h-[190px] rounded-[24px] border-slate-200 bg-slate-50/70 px-4 py-3 leading-7 shadow-inner shadow-slate-100/70 transition focus:border-violet-300 focus:bg-white"
                  />
                </div>

                {pendingFile || initialDocuments.length > 0 ? (
                  <div className="rounded-[24px] border border-dashed border-violet-200 bg-violet-50/45 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Documents adjunts</div>
                        <p className="mt-1 text-sm text-slate-500">Material de suport per a la definicio inicial.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {pendingFile ? (
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm text-violet-900 shadow-sm">
                          <span className="truncate font-medium">{pendingFile.name}</span>
                          <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                            Pendent
                          </span>
                        </div>
                      ) : null}
                      {initialDocuments.map((document) => (
                        <div
                          key={document?.id || document?.url || document?.name}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                        >
                          <Link href={document?.url || '#'} target="_blank" className="min-w-0 truncate font-medium hover:text-violet-700">
                            {document?.name || 'Document del projecte'}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <label
                      htmlFor={compactFileInputId}
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                      title={pendingFile ? `Document seleccionat: ${pendingFile.name}` : 'Adjuntar document'}
                    >
                      <Paperclip className="h-4 w-4" />
                    </label>
                    <div>
                      <div className="font-medium text-slate-700">Adjunta documentacio si cal</div>
                      <div className="text-xs text-slate-400">Brief, proposta o informació base del projecte.</div>
                    </div>
                    <Input
                      id={compactFileInputId}
                      type="file"
                      className="hidden"
                      onChange={async (event) => {
                        const raw = event.target.files?.[0] || null
                        event.target.value = ''
                        if (!raw) {
                          setPendingFile(null)
                          return
                        }
                        if (raw.type.startsWith('image/')) {
                          try {
                            setPendingFile(await compressRasterImageForUpload(raw))
                          } catch {
                            toast({
                              title: 'Imatge',
                              description: "No s ha pogut comprimir la imatge.",
                              variant: 'destructive',
                            })
                            setPendingFile(null)
                          }
                          return
                        }
                        setPendingFile(raw)
                      }}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleCreateProject}
                    disabled={saving || !canContinue}
                    className="h-12 rounded-2xl px-6 text-sm font-semibold shadow-[0_16px_30px_-16px_rgba(124,58,237,0.7)]"
                  >
                    Crear projecte
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[30px] border border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,251,235,0.86),rgba(255,255,255,0.98))] shadow-[0_22px_50px_-34px_rgba(217,119,6,0.25)]">
          <div className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Pas 2</div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Creacio de blocs</h2>
                <p className="text-sm text-slate-500">Estructura el projecte per arees de treball des del principi.</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <ProjectOverviewTab
              project={project}
              availableDepartments={availableDepartments}
              ownerOptions={ownerOptions}
              pendingFile={null}
              blockDraft={blockDraft}
              dirtyOverview={false}
              savingOverview={savingBlocks}
              showBlockComposer={showBlockComposer}
              onSave={() => undefined}
              onProjectChange={setProject}
              onPendingFileChange={() => undefined}
              onSetBlockDraftName={(value) => setBlockDraft((current) => ({ ...current, name: value }))}
              onToggleBlockComposer={() => setShowBlockComposer((current) => !current)}
              onCreateBlock={createBlock}
              onSetBlockName={(blockId, value) => setBlockField(blockId, 'name', value)}
              onAddDepartmentToBlock={addDepartmentToBlock}
              onRemoveDepartmentFromBlock={removeDepartmentFromBlock}
              onRemoveBlock={removeBlock}
              onRemoveDocument={() => undefined}
              manualKickoffEmail=""
              kickoffReady={false}
              sendingKickoff={false}
              onKickoffFieldChange={() => undefined}
              onManualKickoffEmailChange={() => undefined}
              onAddManualKickoffEmail={() => undefined}
              onSendKickoff={() => undefined}
              onRemoveKickoffAttendee={() => undefined}
              showSaveButton={false}
              showBaseSection={false}
              showKickoffSection={false}
              showDocumentSection={false}
              showBlocksHeader={false}
            />
          </div>

          {!showBlockComposer ? (
            <FloatingAddButton
              onClick={() => setShowBlockComposer(true)}
              className="absolute bottom-6 right-6 h-12 w-12 bg-blue-600 hover:bg-blue-700 sm:right-6"
            />
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[32px] border border-sky-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.96),_rgba(240,249,255,0.92)_42%,_rgba(207,250,254,0.78)_100%)] shadow-[0_28px_70px_-34px_rgba(14,116,144,0.28)]">
          <div className="relative overflow-hidden px-6 py-7 sm:px-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.32),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(34,211,238,0.15),_transparent_35%)]" />
            <div className="relative space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/70 px-4 py-2 shadow-sm backdrop-blur">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-sky-600 text-white shadow-[0_10px_24px_-14px_rgba(14,116,144,0.85)]">
                  <Flag className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-600">Pas 3</div>
                  <div className="text-lg font-semibold text-slate-900">Com funciona el modul</div>
                </div>
              </div>

              <div className="max-w-md space-y-3">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.1rem]">
                  Abans d&apos;arrencar, alineem què és un projecte i com s&apos;ha d&apos;utilitzar.
                </h2>
                <p className="text-sm leading-6 text-slate-600 sm:text-[15px]">
                  Aquest espai serveix per entendre el criteri del mòdul i deixar clar què esperem de cada projecte des del primer dia.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">Que es</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Un espai per coordinar objectiu, responsables, blocs, documents i seguiment.</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">Que s&apos;espera</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Cal definir bé el focus, dividir en blocs útils i preparar una arrencada ordenada.</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-600">Norma d&apos;ús</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">No creem projectes sense responsable, objectiu clar ni una utilitat real de seguiment.</p>
                </div>
              </div>

              <div className="rounded-[26px] border border-white/75 bg-white/70 p-5 shadow-sm backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Bones practiques</div>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li>Defineix un nom simple i fàcil de reconèixer.</li>
                  <li>Assigna una persona responsable abans de crear tasques o reunions.</li>
                  <li>Crea blocs per àrees de treball i no per tasques petites.</li>
                  <li>Fes servir la reunió d&apos;arrencada per alinear participants, context i següents passos.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))] shadow-[0_22px_50px_-34px_rgba(15,23,42,0.28)]">
          <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Pas 4</div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Reunio d&apos;arrancada</h2>
                <p className="text-sm text-slate-500">Prepara la convocatoria sense sortir del flux de creació.</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <ProjectKickoffTab
              project={project}
              manualKickoffEmail={manualKickoffEmail}
              kickoffReady={kickoffReady}
              sendingKickoff={sendingKickoff}
              onKickoffFieldChange={setKickoffField}
              onManualKickoffEmailChange={setManualKickoffEmail}
              onAddManualKickoffEmail={addManualKickoffEmail}
              onSendKickoff={handleCreateAndSendKickoff}
              onRemoveKickoffAttendee={removeKickoffAttendee}
            />
          </div>
        </section>
      </div>

      {feedback ? (
        <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              feedback.type === 'error'
                ? 'border border-red-200 bg-red-50 text-red-700'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {feedback.message}
          </div>
        </section>
      ) : null}
    </div>
  )
}
