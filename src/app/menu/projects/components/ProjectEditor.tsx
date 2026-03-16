'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Flag, Layers3, Paperclip, UsersRound } from 'lucide-react'
import { DEPARTMENTS } from '@/data/departments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/use-toast'
import { normalizeRole } from '@/lib/roles'
import ProjectKickoffTab from './ProjectKickoffTab'
import ProjectOverviewTab from './ProjectOverviewTab'
import {
  deriveKickoffAttendees,
  ensureProjectRooms,
  sameStringSet,
  serializeRoomsState,
  syncBlockBudgets,
} from './project-workspace-state'
import {
  EMPTY_KICKOFF,
  deriveProjectPhase,
  getBlockDepartments,
  type ProjectData,
} from './project-shared'
import { useProjectBlocksTasksActions } from './useProjectBlocksTasksActions'
import { useProjectKickoffActions } from './useProjectKickoffActions'
import {
  createBlockDraft,
  createTaskDraft,
  normalizeDepartment,
  type ResponsibleOption,
} from './project-workspace-helpers'

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
  const [responsibles, setResponsibles] = useState<ResponsibleOption[]>([])
  const [usersCatalog, setUsersCatalog] = useState<ResponsibleOption[]>([])
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

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch('/api/users?view=project-options', { cache: 'no-store' })
        if (!res.ok) throw new Error('No s han pogut carregar els usuaris')
        const users = (await res.json()) as Array<{
          id: string
          name?: string
          role?: string
          email?: string
          department?: string
        }>

        const catalog = users
          .map((user) => ({
            id: user.id,
            name: String(user.name || '').trim(),
            role: normalizeRole(user.role || ''),
            email: String(user.email || '').trim(),
            department: String(user.department || '').trim(),
          }))
          .filter((user) => user.name)
          .sort((a, b) => a.name.localeCompare(b.name))

        const nextResponsibles = catalog.filter((user) => {
          return user.role === 'admin' || user.role === 'direccio' || user.role === 'cap'
        })

        if (!cancelled) {
          setUsersCatalog(catalog)
          setResponsibles(nextResponsibles)
        }
      } catch {
        if (!cancelled) {
          setUsersCatalog([])
          setResponsibles([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const ownerOptions = useMemo(() => {
    if (project.owner && !responsibles.some((item) => item.name === project.owner)) {
      return [
        { id: 'current', name: project.owner, role: 'current', email: '', department: '' },
        ...responsibles,
      ]
    }
    return responsibles
  }, [project.owner, responsibles])

  const userByName = useMemo(
    () => new Map(usersCatalog.map((user) => [user.name, user])),
    [usersCatalog]
  )

  const availableDepartments = useMemo(
    () =>
      DEPARTMENTS.filter((department) => {
        const normalized = normalizeDepartment(department)
        return normalized !== 'delsys' && normalized !== 'total'
      }),
    []
  )

  useEffect(() => {
    setProject((current) => {
      const nextDepartments = [
        ...new Set(current.blocks.flatMap((block) => getBlockDepartments(block)).filter(Boolean)),
      ]

      let nextProject =
        sameStringSet(current.departments, nextDepartments)
          ? current
          : {
              ...current,
              departments: nextDepartments,
            }

      const roomsCandidate = ensureProjectRooms(nextProject, userByName)
      if (serializeRoomsState(roomsCandidate.rooms) !== serializeRoomsState(nextProject.rooms)) {
        nextProject = roomsCandidate
      }

      const kickoffAttendees = deriveKickoffAttendees(nextProject, usersCatalog, userByName)
      const sameKickoffAttendees =
        kickoffAttendees.length === nextProject.kickoff.attendees.length &&
        kickoffAttendees.every((item, index) => {
          const currentItem = nextProject.kickoff.attendees[index]
          return (
            currentItem?.key === item.key &&
            currentItem?.userId === item.userId &&
            currentItem?.email === item.email &&
            currentItem?.name === item.name &&
            currentItem?.attended === item.attended &&
            currentItem?.department === item.department
          )
        })

      if (!sameKickoffAttendees) {
        nextProject = {
          ...nextProject,
          kickoff: {
            ...nextProject.kickoff,
            attendees: kickoffAttendees,
          },
        }
      }

      const budgetCandidate = syncBlockBudgets(nextProject)
      const sameBudgets =
        budgetCandidate.blocks.length === nextProject.blocks.length &&
        budgetCandidate.blocks.every((block, index) => block.budget === nextProject.blocks[index]?.budget)

      if (!sameBudgets) {
        nextProject = budgetCandidate
      }

      const nextPhase = deriveProjectPhase(nextProject)
      if (nextProject.phase !== nextPhase || (nextProject.status && nextProject.status !== 'draft')) {
        nextProject = {
          ...nextProject,
          phase: nextPhase,
          status: nextProject.status === 'draft' ? 'draft' : '',
        }
      }

      return nextProject === current ? current : nextProject
    })
  }, [
    project.blocks,
    project.owner,
    project.sponsor,
    project.kickoff.date,
    project.kickoff.startTime,
    project.kickoff.status,
    project.kickoff.attendees.length,
    usersCatalog,
    userByName,
  ])

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

  const {
    createBlock,
    setBlockField,
    removeBlock,
    addDepartmentToBlock,
    removeDepartmentFromBlock,
  } = useProjectBlocksTasksActions({
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

  const canContinue = Boolean(
    project.name.trim() &&
      project.owner.trim() &&
      project.context.trim() &&
      project.strategy.trim() &&
      project.launchDate
  )
  const hasMeaningfulContent = Boolean(
    project.name.trim() ||
      project.owner.trim() ||
      project.context.trim() ||
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

  const buildForm = (status: '' | 'draft') => {
    const form = new FormData()
    form.set('name', project.name)
    form.set('sponsor', project.sponsor)
    form.set('owner', project.owner)
    form.set('context', project.context)
    form.set('strategy', project.strategy)
    form.set('risks', '')
    form.set('startDate', project.startDate)
    form.set('launchDate', project.launchDate)
    form.set('budget', '')
    form.set('phase', deriveProjectPhase(project))
    form.set('status', status)
    form.set('departments', JSON.stringify(project.departments))
    form.set('blocks', JSON.stringify(project.blocks))
    form.set('rooms', JSON.stringify(project.rooms))
    form.set('documents', JSON.stringify(project.documents || []))
    form.set('kickoff', JSON.stringify(project.kickoff))
    if (pendingFile) {
      form.set('file', pendingFile)
      form.set('fileLabel', 'Document inicial')
    }
    return form
  }

  const applyStoredDocument = (document?: ProjectData['document']) => {
    if (!document) return
    setProject((current) => {
      const alreadyExists = current.documents.some((item) => item?.id && item.id === document?.id)
      return {
        ...current,
        document,
        documents: alreadyExists ? current.documents : [...current.documents, document],
      }
    })
  }

  const persistProject = async (status: '' | 'draft', existingId?: string) => {
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
  }

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
      ? ((await res.json().catch(() => null)) as {
          error?: string
          warning?: string
        } | null)
      : ({
          error: (await res.text().catch(() => '')).trim() || `HTTP ${res.status}`,
        } as { error?: string; warning?: string })

    if (!res.ok) {
      throw new Error(payload?.error || `No s'ha pogut crear la convocatòria (${res.status})`)
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
          ? `Projecte creat i convocatòria enviada amb avis: ${warning}`
          : 'Projecte creat i convocatòria enviada correctament.',
      })
      toast({
        title: warning ? 'Convocatoria creada amb avis' : 'Convocatoria enviada',
        description: warning || undefined,
        variant: warning ? 'destructive' : 'default',
      })
      router.replace(`/menu/projects/${id}?tab=kickoff`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error enviant la convocatòria'
      setFeedback({ type: 'error', message })
      toast({ title: 'Error enviant la convocatòria', description: message, variant: 'destructive' })
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
        context: project.context,
        strategy: project.strategy,
        startDate: project.startDate,
        launchDate: project.launchDate,
        departments: project.departments,
        blocks: project.blocks,
        rooms: project.rooms,
        documents: project.documents,
        kickoff: project.kickoff,
        phase: project.phase,
        status: project.status,
      },
      pendingFile: pendingFile
        ? { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type }
        : null,
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
              context: project.context,
              strategy: project.strategy,
              startDate: project.startDate,
              launchDate: project.launchDate,
              departments: project.departments,
              blocks: project.blocks,
              rooms: project.rooms,
              documents: project.documents,
              kickoff: project.kickoff,
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
  }, [
    draftId,
    hasMeaningfulContent,
    pendingFile,
    project,
    saving,
    sendingKickoff,
  ])

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-200 bg-gradient-to-r from-violet-50 via-white to-violet-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Flag className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">1. Introducció de dades</h1>
                <p className="text-sm text-slate-500">
                  Dades inicials del projecte abans de la reunió d'arrencada.
                  {autosaving ? " Guardant l'esborrany..." : draftId ? ' Esborrany desat automàticament.' : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <section className="space-y-5 rounded-[24px] border border-violet-200 bg-violet-50/40 p-5">
              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Nom del projecte</Label>
                  <Input
                    id="project-name"
                    value={project.name}
                    onChange={(event) => setProjectField('name', event.target.value)}
                    placeholder="Nom del projecte"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-sponsor">Responsable impulsor</Label>
                  <Input
                    id="project-sponsor"
                    value={project.sponsor}
                    readOnly
                    placeholder="Nom i cognoms"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Responsable del projecte</Label>
                  <select
                    value={project.owner || ''}
                    onChange={(event) => setProjectField('owner', event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-400"
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

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="project-start-date">Data inici prevista</Label>
                  <Input
                    id="project-start-date"
                    type="date"
                    value={project.startDate}
                    onChange={(event) => setProjectField('startDate', event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-launch-date">Data objectiu d'arrencada</Label>
                  <Input
                    id="project-launch-date"
                    type="date"
                    value={project.launchDate}
                    onChange={(event) => setProjectField('launchDate', event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-context">Definició del projecte</Label>
                <Textarea
                  id="project-context"
                  value={project.context}
                  onChange={(event) => setProjectField('context', event.target.value)}
                  placeholder="Context, necessitat i definició inicial"
                  className="min-h-[140px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project-strategy">Objectius estratègics</Label>
                <Textarea
                  id="project-strategy"
                  value={project.strategy}
                  onChange={(event) => setProjectField('strategy', event.target.value)}
                  placeholder="Objectius i alineació amb l'empresa"
                  className="min-h-[120px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <label
                  htmlFor={compactFileInputId}
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-violet-100 text-violet-700 transition hover:bg-violet-200"
                  title={pendingFile ? `Document seleccionat: ${pendingFile.name}` : 'Adjuntar document'}
                >
                  <Paperclip className="h-4 w-4" />
                </label>
                <Input
                  id={compactFileInputId}
                  type="file"
                  className="hidden"
                  onChange={(event) => setPendingFile(event.target.files?.[0] || null)}
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleCreateProject}
                  disabled={saving || !canContinue}
                >
                  Crear projecte
                </Button>
              </div>

              {pendingFile || initialDocuments.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <div className="mb-2 text-sm font-medium text-slate-700">Documents adjunts</div>
                  <div className="space-y-2">
                    {pendingFile ? (
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-800">
                        <span className="truncate">{pendingFile.name}</span>
                        <span className="shrink-0 text-xs font-medium">Pendent de guardar</span>
                      </div>
                    ) : null}
                    {initialDocuments.map((document) => (
                      <div
                        key={document?.id || document?.url || document?.name}
                        className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
                      >
                        <Link
                          href={document?.url || '#'}
                          target="_blank"
                          className="min-w-0 truncate hover:text-violet-700"
                        >
                          {document?.name || 'Document del projecte'}
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">2. Reunió d'arrencada</h2>
                <p className="text-sm text-slate-500">Preparació de la reunió d'arrencada des de la creació del projecte.</p>
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

        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">3. Creació de blocs</h2>
                <p className="text-sm text-slate-500">Departaments implicats i estructura inicial del projecte.</p>
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
              showSaveButton={false}
              showBaseSection={false}
              showKickoffSection={false}
              showDocumentSection={false}
              showBlocksHeader={false}
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
