'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FileText, MessageSquare, Paperclip, Plus, Save, Trash2, Users2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { normalizeRole } from '@/lib/roles'
import { RoleGuard } from '@/lib/withRoleGuard'
import { colorByDepartment } from '@/lib/colors'
import { initials } from '@/app/menu/missatgeria/utils'
import ProjectTaskQuickComposer from '../../../components/ProjectTaskQuickComposer'
import ProjectRoomOpsChat from '../../../components/ProjectRoomOpsChat'
import {
  clampProjectDeadline,
  formatProjectDate,
  getBlockDepartments,
  getPreLaunchDeadline,
  getPrimaryBlockDepartment,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  type ProjectData,
} from '../../../components/project-shared'
import { priorityBadgeClass, taskStatusBadgeClass } from '../../../components/project-workspace-helpers'

type ProjectResponse = ProjectData

type UserOption = {
  id: string
  name: string
  department: string
  role: string
}

type RoomDetailResponse = {
  project: ProjectResponse
  users: UserOption[]
}

type ResolvedRoom = NonNullable<ProjectResponse['rooms'][number]>
type ProjectDocumentItem = NonNullable<ProjectData['documents']>[number]

const appendProjectDocument = (
  documents: ProjectData['documents'] | undefined,
  document: ProjectDocumentItem
): ProjectDocumentItem[] =>
  [...(documents || []), document].filter(
    (item): item is ProjectDocumentItem => Boolean(item)
  )

export default function ProjectRoomDetailPage() {
  const params = useParams<{ id: string; roomId: string }>()
  const { data: session } = useSession()
  const sessionUserId = String((session?.user as any)?.id || '').trim()
  const sessionUserName = String((session?.user as any)?.name || '').trim()
  const sessionRole = normalizeRole(String((session?.user as any)?.role || '').trim())
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [users, setUsers] = useState<UserOption[]>([])
  const [error, setError] = useState('')
  const [participantDraft, setParticipantDraft] = useState('')
  const [taskDraft, setTaskDraft] = useState({
    description: '',
    department: '',
    deadline: '',
    priority: 'normal',
  })
  const [pendingDocument, setPendingDocument] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [documentsView, setDocumentsView] = useState<'initial' | 'operational'>('initial')
  const [showTaskComposer, setShowTaskComposer] = useState(false)
  const [hashTaskDraft, setHashTaskDraft] = useState<{
    description: string
    deadline: string
    owner: string
  } | null>(null)
  const hashTaskPromiseRef = useRef<{
    resolve: (value: { title: string }) => void
    reject: (reason?: unknown) => void
  } | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        if (!params?.id) throw new Error('Projecte no trobat')

        const roomRes = await fetch(`/api/projects/${params.id}/rooms/${params.roomId}`, {
          cache: 'no-store',
        })

        if (!roomRes.ok) {
          const payload = (await roomRes.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || 'No s ha pogut carregar la sala')
        }

        const payload = (await roomRes.json()) as RoomDetailResponse

        if (cancelled) return

        setProject(payload.project)
        setUsers(payload.users.filter((user) => user.name))
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error carregant la sala')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params?.id, params?.roomId])

  const room = useMemo(
    () => project?.rooms?.find((item) => item.id === params?.roomId) || null,
    [project, params]
  )

  const linkedBlock = useMemo(
    () => project?.blocks?.find((block) => block.id === room?.blockId) || null,
    [project, room]
  )

  const fallbackRoom = useMemo(() => {
    if (room || !project || !params?.roomId?.startsWith('room-block-')) return null
    const blockId = params.roomId.replace('room-block-', '')
    const block = project.blocks?.find((item) => item.id === blockId)
    if (!block) return null

    const participants = [
      ...new Set(
        [project.owner || '', block.owner || '', ...(block.tasks || []).map((task) => task.owner || '')].filter(
          Boolean
        )
      ),
    ]

    return {
      id: params.roomId,
      name: block.name || getPrimaryBlockDepartment(block) || 'Sala de bloc',
      kind: 'block' as const,
      blockId,
      opsChannelId: '',
      opsChannelName: block.name || getPrimaryBlockDepartment(block) || 'Sala de bloc',
      opsChannelSource: 'projects' as const,
      opsSyncedAt: 0,
      departments: getBlockDepartments(block),
      participants,
      participantDetails: participants.map((name) => ({ name })),
      notes: '',
      documents: [],
    }
  }, [params, project, room])

  const currentRoom: ResolvedRoom | null = room || fallbackRoom
  const currentBlock =
    linkedBlock ||
    (fallbackRoom ? project?.blocks?.find((block) => block.id === fallbackRoom.blockId) || null : null)
  const linkedTasks = currentBlock?.tasks || []
  const roomResponsibleName = currentBlock?.owner || project?.owner || ''
  const normalizeText = (value?: string | null) =>
    String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
  const canCreateTaskFromChat =
    !!currentBlock &&
    !!currentRoom &&
    currentRoom.opsChannelSource === 'projects' &&
    (
      sessionRole === 'admin' ||
      (sessionUserId && sessionUserId === String(project?.ownerUserId || '').trim()) ||
      normalizeText(sessionUserName) === normalizeText(project?.owner || '') ||
      normalizeText(sessionUserName) === normalizeText(currentBlock?.owner || '')
    )
  const inheritedInitialDocuments = useMemo(
    () => (project?.documents || []).filter((item) => item && ['initial', 'kickoff'].includes(item.category || '')),
    [project?.documents]
  )
  const inheritedOperationalDocuments = useMemo(
    () => (project?.documents || []).filter((item) => item && ['general', 'block', 'other'].includes(item.category || '')),
    [project?.documents]
  )
  const taskDocuments = useMemo(
    () =>
      (currentBlock?.tasks || []).flatMap((task) =>
        (task.documents || [])
          .filter(Boolean)
          .map((document) => ({
            ...document,
            category: document?.category || 'block',
            label: document?.label || task.title || 'Tasca',
          }))
      ),
    [currentBlock]
  )
  const roomDocuments = currentRoom?.documents || []
  const visibleDocuments =
    documentsView === 'initial'
      ? inheritedInitialDocuments
      : [...inheritedOperationalDocuments, ...taskDocuments, ...roomDocuments]
  const statusLabel = (value?: string) =>
    TASK_STATUS_OPTIONS.find((option) => option.value === value)?.label || value || 'Pendent'
  const priorityLabel = (value?: string) =>
    TASK_PRIORITY_OPTIONS.find((option) => option.value === value)?.label || value || 'Normal'
  const dayDiffFromToday = (value?: string | null) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    const target = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
    if (Number.isNaN(target.getTime())) return null
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }
  const deadlineBadgeClass = (daysLeft: number | null, status?: string) => {
    if (status === 'done') return 'bg-emerald-100 text-emerald-700'
    if (daysLeft === null) return 'bg-slate-100 text-slate-700'
    if (daysLeft < 0) return 'bg-rose-100 text-rose-700'
    if (daysLeft <= 3) return 'bg-rose-100 text-rose-700'
    if (daysLeft <= 7) return 'bg-amber-100 text-amber-800'
    return 'bg-emerald-100 text-emerald-700'
  }
  const deadlineBadgeLabel = (daysLeft: number | null, status?: string) => {
    if (status === 'done') return 'Feta en termini'
    if (daysLeft === null) return 'Sense data'
    if (daysLeft < 0) return `Retard ${Math.abs(daysLeft)} dies`
    if (daysLeft === 0) return 'Venc avui'
    if (daysLeft === 1) return 'Falta 1 dia'
    return `Falten ${daysLeft} dies`
  }
  const projectDaysLeft = dayDiffFromToday(project?.launchDate)
  const blockDaysLeft = dayDiffFromToday(currentBlock?.deadline)

  const participantOptions = useMemo(() => {
    if (!currentRoom) return users
    const allowedDepartments = new Set(
      (currentRoom.departments || [])
        .map((department) =>
          department
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim()
        )
        .filter(Boolean)
    )

    return users.filter((user) => {
      if (currentRoom.participants.includes(user.name)) return false
      if (allowedDepartments.size === 0) return true

      const userDepartment = (user.department || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()

      return allowedDepartments.has(userDepartment)
    })
  }, [currentRoom, users])

  const roomTaskResponsibleOptions = useMemo(() => {
    if (!currentBlock) return []

    const allowedDepartments = new Set(
      getBlockDepartments(currentBlock).map((department) => normalizeText(department))
    )

    const filtered = users.filter((user) => {
      if (!user.name) return false
      if (
        normalizeText(user.name) === normalizeText(currentBlock.owner) ||
        normalizeText(user.name) === normalizeText(project?.owner || '')
      ) {
        return true
      }
      return allowedDepartments.has(normalizeText(user.department || ''))
    })

    const byName = new Map<string, { id: string; name: string }>()
    filtered.forEach((user) => {
      const key = normalizeText(user.name)
      if (!key || byName.has(key)) return
      byName.set(key, { id: user.id, name: user.name })
    })

    return Array.from(byName.values())
  }, [currentBlock, project?.owner, users])

  useEffect(() => {
    if (!params?.id || !params?.roomId || !currentRoom || currentRoom.opsChannelId) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${params.id}/rooms/${params.roomId}`, {
          method: 'PUT',
        })
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string
          room?: NonNullable<typeof currentRoom>
        }
        if (!res.ok || !payload.room || cancelled) return

        updateRoomLocal(() => payload.room!)
      } catch {
        if (!cancelled) {
          setError((current) => current || 'No s ha pogut enllacar la sala amb Ops')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params?.id, params?.roomId, currentRoom?.id, currentRoom?.opsChannelId])

  const persistRoom = async (
    nextRoom: ResolvedRoom,
    nextTasks?: typeof linkedTasks
  ) => {
    if (!params?.id || !params?.roomId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/rooms/${params.roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: nextRoom,
          tasks: nextTasks,
        }),
      })

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
          room?: ResolvedRoom
      }
      if (!res.ok) throw new Error(payload.error || 'No s ha pogut guardar la sala')
      if (payload.room) {
        updateRoomLocal(() => payload.room!)
      }
    } finally {
      setSaving(false)
    }
  }

  const updateRoomLocal = (updater: (currentRoom: ResolvedRoom) => ResolvedRoom) => {
    setProject((current) => {
      if (!current) return current
      const exists = (current.rooms || []).some((item) => item.id === params?.roomId)
      const targetRoom = (current.rooms || []).find((item) => item.id === params?.roomId) || fallbackRoom
      if (!targetRoom) return current
      const updated = updater(targetRoom)
      return {
        ...current,
        rooms: exists
          ? (current.rooms || []).map((item) => (item.id === params?.roomId ? updated : item))
          : [...(current.rooms || []), updated],
      }
    })
  }

  const updateBlockTasksLocal = (tasks: NonNullable<typeof linkedBlock>['tasks']) => {
    setProject((current) => {
      if (!current || !currentRoom?.blockId) return current
      return {
        ...current,
        blocks: (current.blocks || []).map((block) =>
          block.id === currentRoom.blockId ? { ...block, tasks } : block
        ),
      }
    })
  }

  const addParticipant = async () => {
    if (!currentRoom || !participantDraft) return
    const user = users.find((item) => item.name === participantDraft)
    const nextRoom = {
      ...currentRoom,
      participants: [...new Set([...(currentRoom.participants || []), participantDraft])],
      participantDetails: [
        ...(currentRoom.participantDetails || []),
        {
          name: participantDraft,
          department: user?.department || '',
          role: user?.role || '',
        },
      ].filter(
        (participant, index, array) =>
          array.findIndex((item) => item.name === participant.name) === index
      ),
    }
    updateRoomLocal(() => nextRoom)
    setParticipantDraft('')
    await persistRoom(nextRoom)
    toast({ title: 'Participant afegit' })
  }

  const buildProjectForm = (sourceProject: ProjectResponse) => {
    const form = new FormData()
    form.set('name', sourceProject.name || '')
    form.set('sponsor', sourceProject.sponsor || '')
    form.set('owner', sourceProject.owner || '')
    form.set('context', sourceProject.context || '')
    form.set('strategy', sourceProject.strategy || '')
    form.set('risks', sourceProject.risks || '')
    form.set('startDate', sourceProject.startDate || '')
    form.set('launchDate', sourceProject.launchDate || '')
    form.set('budget', sourceProject.budget || '')
    form.set('phase', sourceProject.phase || 'planning')
    form.set('status', '')
    form.set('departments', JSON.stringify(sourceProject.departments || []))
    form.set('blocks', JSON.stringify(sourceProject.blocks || []))
    form.set('rooms', JSON.stringify(sourceProject.rooms || []))
    form.set('documents', JSON.stringify(sourceProject.documents || []))
    form.set('kickoff', JSON.stringify(sourceProject.kickoff || null))
    return form
  }

  const removeParticipant = async (name: string) => {
    if (!currentRoom) return
    const nextRoom = {
      ...currentRoom,
      participants: (currentRoom.participants || []).filter((item) => item !== name),
      participantDetails: (currentRoom.participantDetails || []).filter((item) => item.name !== name),
    }
    updateRoomLocal(() => nextRoom)
    await persistRoom(nextRoom)
    toast({ title: 'Participant eliminat' })
  }

  const uploadRoomDocument = async () => {
    if (!pendingDocument || !params?.id || !params?.roomId) return
    setSaving(true)
    try {
      const form = new FormData()
      form.set('file', pendingDocument)

      const res = await fetch(`/api/projects/${params.id}/rooms/${params.roomId}`, {
        method: 'POST',
        body: form,
      })
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        document?: NonNullable<ProjectData['documents'][number]>
      }
      if (!res.ok || !payload.document) {
        throw new Error(payload.error || 'No s ha pogut adjuntar el document')
      }
      const uploadedDocument = payload.document

      updateRoomLocal((current) => ({
        ...current,
        documents: appendProjectDocument(current.documents, uploadedDocument),
      }))
      setPendingDocument(null)
      toast({ title: 'Document de sala guardat' })
    } catch (err: unknown) {
      toast({
        title: 'Error guardant el document',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const uploadInitialDocument = async () => {
    if (!pendingDocument || !params?.id || !project) return
    setSaving(true)
    try {
      const form = buildProjectForm(project)
      form.set('file', pendingDocument)
      form.set('fileCategory', 'initial')
      form.set('fileLabel', pendingDocument.name)

      const res = await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        body: form,
      })

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string
        document?: NonNullable<ProjectData['documents'][number]>
      }
      if (!res.ok || !payload.document) {
        throw new Error(payload.error || 'No s ha pogut adjuntar el document inicial')
      }
      const uploadedDocument = payload.document

      setProject((current) =>
        current
          ? {
              ...current,
              documents: appendProjectDocument(current.documents, uploadedDocument),
            }
          : current
      )
      setPendingDocument(null)
      toast({ title: 'Document inicial guardat' })
    } catch (err: unknown) {
      toast({
        title: 'Error guardant el document',
        description: err instanceof Error ? err.message : 'Error inesperat',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const addTask = async () => {
    if (!currentRoom || !currentBlock || !taskDraft.description.trim()) return
    const generatedTitle =
      taskDraft.description
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(' ') || 'Nova tasca'
    const nextTasks = [
      ...(currentBlock.tasks || []),
      {
        id: `task-${Date.now()}`,
        createdAt: Date.now(),
        title: generatedTitle,
        description: taskDraft.description.trim(),
        department:
          taskDraft.department || (getBlockDepartments(currentBlock).length === 1 ? getBlockDepartments(currentBlock)[0] : ''),
        owner: '',
        deadline: clampProjectDeadline(taskDraft.deadline, currentBlock.deadline || project?.launchDate),
        dependsOn: '',
        priority: taskDraft.priority,
        status: 'pending',
        documents: [],
      },
    ]
    updateBlockTasksLocal(nextTasks)
    setTaskDraft({ description: '', department: '', deadline: '', priority: 'normal' })
    setShowTaskComposer(false)
    await persistRoom(currentRoom, nextTasks)
    toast({ title: 'Tasca afegida a la sala' })
  }

  const closeHashTaskModal = () => {
    setHashTaskDraft(null)
    hashTaskPromiseRef.current = null
  }

  const createTaskFromChat = async (rawText: string) => {
    if (!currentRoom || !currentBlock || !canCreateTaskFromChat) {
      throw new Error('No tens permisos per crear tasques des del xat')
    }

    const description = rawText.trim()
    if (!description) {
      throw new Error('Escriu text despres del signe #')
    }

    return await new Promise<{ title: string }>((resolve, reject) => {
      hashTaskPromiseRef.current = { resolve, reject }
      setHashTaskDraft({
        description,
        deadline: '',
        owner: '',
      })
    })
  }

  const submitHashTask = async () => {
    if (!currentRoom || !currentBlock || !hashTaskDraft) return

    const description = hashTaskDraft.description.trim()
    const generatedTitle =
      description
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .join(' ') || 'Nova tasca'

    const nextTasks = [
      ...(currentBlock.tasks || []),
      {
        id: `task-${Date.now()}`,
        createdAt: Date.now(),
        title: generatedTitle,
        description,
        department: getPrimaryBlockDepartment(currentBlock),
        owner: hashTaskDraft.owner,
        deadline: clampProjectDeadline(hashTaskDraft.deadline, currentBlock.deadline || project?.launchDate),
        dependsOn: '',
        priority: 'normal',
        status: 'pending',
        documents: [],
      },
    ]

    try {
      updateBlockTasksLocal(nextTasks)
      await persistRoom(currentRoom, nextTasks)
      toast({ title: 'Tasca creada des del xat' })
      hashTaskPromiseRef.current?.resolve({ title: generatedTitle })
      closeHashTaskModal()
    } catch (err) {
      hashTaskPromiseRef.current?.reject(err)
      closeHashTaskModal()
      throw err
    }
  }

  const cancelHashTask = () => {
    hashTaskPromiseRef.current?.reject(new Error('cancelled'))
    closeHashTaskModal()
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="flex min-h-[calc(100vh-72px)] w-full max-w-none flex-col gap-3 overflow-hidden p-3">
        <ModuleHeader
          title="Sales"
          subtitle={currentRoom?.name || 'Sala'}
          mainHref={`/menu/projects/${params?.id}?tab=blocks`}
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!currentRoom && !error ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
            Carregant sala...
          </div>
        ) : null}

        {currentRoom ? (
          <div className="flex flex-1 min-h-0 flex-col space-y-4">
            <Dialog
              open={!!hashTaskDraft}
              onOpenChange={(open) => {
                if (!open && hashTaskDraft) cancelHashTask()
              }}
            >
              <DialogContent className="w-[92vw] max-w-sm rounded-2xl p-4">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold">Nova tasca des del xat</DialogTitle>
                </DialogHeader>

                {hashTaskDraft ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {hashTaskDraft.description}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Responsable</label>
                      <Select
                        value={hashTaskDraft.owner || 'none'}
                        onValueChange={(value) =>
                          setHashTaskDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  owner: value === 'none' ? '' : value,
                                }
                              : current
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sense responsable" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sense responsable</SelectItem>
                          {roomTaskResponsibleOptions.map((option) => (
                            <SelectItem key={option.id} value={option.name}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Deadline</label>
                      <Input
                        type="date"
                        value={hashTaskDraft.deadline}
                        min={project?.startDate || undefined}
                        max={
                          getPreLaunchDeadline(currentBlock?.deadline) ||
                          getPreLaunchDeadline(project?.launchDate) ||
                          undefined
                        }
                        onChange={(event) =>
                          setHashTaskDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  deadline: event.target.value,
                                }
                              : current
                          )
                        }
                      />
                    </div>

                    <div className="grid gap-2 pt-1 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={cancelHashTask}
                        disabled={saving}
                      >
                        Cancel.lar
                      </Button>
                      <Button
                        type="button"
                        className="w-full bg-violet-600 text-white hover:bg-violet-700"
                        onClick={submitHashTask}
                        disabled={saving}
                      >
                        Crear tasca
                      </Button>
                    </div>
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>

            <section className="rounded-[24px] border border-slate-200 bg-white px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-semibold text-slate-900">{currentRoom.name}</div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    currentRoom.kind === 'block'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-violet-100 text-violet-700'
                  }`}
                >
                  {currentRoom.kind === 'block' ? 'Sala automatica' : 'Sala manual'}
                </span>
              </div>

              <div className="mt-3 grid gap-3 rounded-2xl bg-slate-50 px-4 py-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.35fr)]">
                <Link
                  href={`/menu/projects/${params?.id}?tab=overview`}
                  className="min-w-0 rounded-xl px-1 py-1 transition hover:bg-white/70"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Projecte</div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-900 hover:text-violet-700">
                    {project?.name || '-'}
                  </div>
                </Link>

                <Link
                  href={`/menu/projects/${params?.id}?tab=blocks`}
                  className="min-w-0 rounded-xl px-1 py-1 transition hover:bg-white/70"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-400">Bloc vinculat</div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-900 hover:text-violet-700">
                    {currentBlock?.name || 'Sense bloc'}
                  </div>
                </Link>

                <div className="min-w-0 rounded-xl px-1 py-1">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Departaments</div>
                      <div className="mt-1 truncate text-sm font-medium text-slate-900">
                        {currentRoom.departments.length > 0
                          ? currentRoom.departments.join(', ')
                          : 'Sense departament'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Participants</div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {currentRoom.participants.length}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-xl px-1 py-1">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">Projecte</span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-700">
                        {formatProjectDate(project?.launchDate)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${deadlineBadgeClass(projectDaysLeft)}`}>
                        {deadlineBadgeLabel(projectDaysLeft)}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">Bloc</span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-700">
                        {formatProjectDate(currentBlock?.deadline)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${deadlineBadgeClass(blockDaysLeft)}`}>
                        {deadlineBadgeLabel(blockDaysLeft)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:flex-1 xl:min-h-0 xl:grid-cols-[1.15fr_0.62fr_0.78fr]">
              <section className="flex min-h-[560px] flex-col rounded-[24px] border border-slate-200 bg-white xl:min-h-0">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-slate-500" />
                      <div className="text-sm font-semibold text-slate-900">Conversa</div>
                    </div>
                    <button
                      type="button"
                      className={`rounded-full p-2 transition ${
                        participantsOpen
                          ? 'bg-violet-100 text-violet-700'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                      onClick={() => setParticipantsOpen((current) => !current)}
                      title="Participants"
                    >
                      <Users2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {participantsOpen ? (
                  <div className="border-b border-slate-200 bg-white px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Participants</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Responsable:{' '}
                          <span className="font-semibold text-slate-700">
                            {roomResponsibleName || 'No assignat'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Select value={participantDraft || undefined} onValueChange={setParticipantDraft}>
                          <SelectTrigger className="min-w-[240px]">
                            <SelectValue placeholder="Afegir participant" />
                          </SelectTrigger>
                          <SelectContent>
                            {participantOptions.map((user) => (
                              <SelectItem key={user.id} value={user.name}>
                                {user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="icon"
                          className="rounded-full"
                          onClick={addParticipant}
                          disabled={saving || !participantDraft}
                          title="Afegir participant"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {currentRoom.participantDetails && currentRoom.participantDetails.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {currentRoom.participantDetails.map((participant) => {
                          const isResponsible =
                            roomResponsibleName.length > 0 &&
                            participant.name.trim().toLowerCase() === roomResponsibleName.toLowerCase()
                          return (
                            <div
                              key={`${currentRoom.id}-${participant.name}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                                  {initials(participant.name)}
                                </div>
                                <div>
                                  <div className="text-sm text-slate-900">{participant.name}</div>
                                  <div className="text-xs text-slate-500">
                                    {[participant.department, participant.role].filter(Boolean).join(' · ')}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {isResponsible ? (
                                  <span className="text-xs font-semibold text-emerald-700">
                                    Responsable
                                  </span>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => removeParticipant(participant.name)}
                                  title="Treure participant"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-slate-500">Sense membres.</div>
                    )}
                  </div>
                ) : null}

                {currentRoom.opsChannelId ? (
                  <ProjectRoomOpsChat
                    channelId={currentRoom.opsChannelId}
                    userId={String((session?.user as any)?.id || '')}
                    canCreateTaskFromHash={canCreateTaskFromChat}
                    onCreateTaskFromHash={createTaskFromChat}
                    onOperationalDocumentCreated={(document) => {
                      updateRoomLocal((room) => ({
                        ...room,
                        documents: (room.documents || []).some(
                          (item) =>
                            (item?.id || item?.url || `${item?.name || ''}-${item?.label || ''}`) ===
                            (document?.id || document?.url || `${document?.name || ''}-${document?.label || ''}`)
                        )
                          ? room.documents || []
                          : [...(room.documents || []), document],
                      }))
                    }}
                  />
                ) : (
                  <div className="flex-1 px-5 py-4 text-sm text-slate-500">
                    Preparant la conversa d Ops per a aquesta sala...
                  </div>
                )}
              </section>

              <div className="space-y-4 xl:min-h-0 xl:overflow-auto">
                <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-6">
                  <Link
                    href={`/menu/projects/${params?.id}?tab=documents`}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-violet-700"
                  >
                    <FileText className="h-4 w-4 text-slate-500" />
                    <div>Documents</div>
                  </Link>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDocumentsView('initial')}
                        className={`rounded-full px-4 py-2 text-sm transition ${
                          documentsView === 'initial'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Docs inicials
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentsView('operational')}
                        className={`rounded-full px-4 py-2 text-sm transition ${
                          documentsView === 'operational'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Docs operatius
                      </button>
                    </div>

                    <input
                      id="room-documents-file"
                      type="file"
                      className="hidden"
                      onChange={(event) => setPendingDocument(event.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-full"
                      onClick={() => document.getElementById('room-documents-file')?.click()}
                      title="Adjuntar document"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </div>

                  {pendingDocument ? (
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        onClick={documentsView === 'initial' ? uploadInitialDocument : uploadRoomDocument}
                        disabled={saving || !pendingDocument}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Guardar
                      </Button>
                    </div>
                  ) : null}

                  {visibleDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {visibleDocuments.map((document) => (
                        <div
                          key={document?.id || document?.url || `${document?.name || ''}-${document?.label || ''}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3"
                        >
                          <div>
                            {document?.url ? (
                              <Link
                                href={document.url}
                                target="_blank"
                                className="text-sm font-medium text-slate-900 hover:text-violet-700"
                              >
                                {document?.name || document?.label || 'Document'}
                              </Link>
                            ) : (
                              <div className="text-sm font-medium text-slate-900">
                                {document?.name || document?.label || 'Document'}
                              </div>
                            )}
                            <div className="mt-1 text-xs text-slate-500">
                              {documentsView === 'initial'
                                ? 'Projecte'
                                : roomDocuments.some((item) => (item?.id || item?.url || `${item?.name || ''}-${item?.label || ''}`) === (document?.id || document?.url || `${document?.name || ''}-${document?.label || ''}`))
                                  ? currentRoom?.name || 'Sala'
                                  : currentBlock?.name || 'Projecte'}
                              {document?.category ? ` · ${document.category}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      {documentsView === 'initial'
                        ? 'Aquesta sala encara no te documents inicials visibles.'
                        : 'Aquesta sala encara no te documents operatius visibles.'}
                    </div>
                  )}
                </section>
              </div>
              <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-6 xl:min-h-0 xl:overflow-auto">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/menu/projects/${params?.id}?tab=tasks`}
                    className="text-sm font-semibold text-slate-900 hover:text-violet-700"
                  >
                    Tasques vinculades
                  </Link>
                  {currentBlock ? (
                    <Button
                      type="button"
                      size="icon"
                      className="rounded-full bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => setShowTaskComposer((current) => !current)}
                      title="Afegir tasca"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                {currentBlock && showTaskComposer ? (
                  <ProjectTaskQuickComposer
                    description={taskDraft.description}
                    department={taskDraft.department}
                    owner=""
                    deadline={taskDraft.deadline}
                    priority={taskDraft.priority || 'normal'}
                    departments={getBlockDepartments(currentBlock)}
                    responsibleOptions={users
                      .filter((user) => roomTaskResponsibleOptions.some((option) => option.id === user.id))
                      .map((user) => ({ id: user.id, name: user.name }))}
                    maxDeadline={
                      getPreLaunchDeadline(currentBlock.deadline) ||
                      getPreLaunchDeadline(project?.launchDate) ||
                      undefined
                    }
                    compact
                    disabled={saving}
                    onDescriptionChange={(value) => setTaskDraft((current) => ({ ...current, description: value }))}
                    onDepartmentChange={(value) => setTaskDraft((current) => ({ ...current, department: value }))}
                    onOwnerChange={() => {}}
                    onDeadlineChange={(value) => setTaskDraft((current) => ({ ...current, deadline: value }))}
                    onPriorityChange={(value) => setTaskDraft((current) => ({ ...current, priority: value }))}
                    onSubmit={addTask}
                  />
                ) : !currentBlock ? (
                  <div className="text-sm text-slate-500">
                    Aquesta sala no esta vinculada a cap bloc. No hi ha tasques automatiques.
                  </div>
                ) : null}

                {linkedTasks.length > 0 ? (
                  <div className="space-y-2">
                    {linkedTasks.map((task) => (
                      (() => {
                        const daysLeft = dayDiffFromToday(task.deadline)
                        return (
                      <div
                        key={task.id}
                        className={`rounded-2xl border px-4 py-3 ${
                          task.status !== 'done' && daysLeft !== null && daysLeft < 0
                            ? 'border-rose-200 bg-rose-50/70'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="text-sm font-medium text-slate-900">{task.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className={`rounded-full px-2.5 py-1 font-medium ${colorByDepartment(task.department || getPrimaryBlockDepartment(currentBlock || { department: '', departments: [] }) || '')}`}>
                            {task.department || getPrimaryBlockDepartment(currentBlock || { department: '', departments: [] }) || 'Sense departament'}
                          </span>
                          <span>{task.owner || 'Sense responsable'}</span>
                          <span>·</span>
                          <span>{formatProjectDate(task.deadline)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className={`rounded-full px-3 py-1 ${taskStatusBadgeClass(task.status)}`}>
                            {statusLabel(task.status)}
                          </span>
                          <span className={`rounded-full px-3 py-1 ${priorityBadgeClass(task.priority)}`}>
                            {priorityLabel(task.priority)}
                          </span>
                          <span className={`rounded-full px-3 py-1 ${deadlineBadgeClass(daysLeft, task.status)}`}>
                            {deadlineBadgeLabel(daysLeft, task.status)}
                          </span>
                        </div>
                      </div>
                        )
                      })()
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Aquesta sala encara no te tasques vinculades.</div>
                )}
              </section>
            </div>

          </div>
        ) : null}
      </div>
    </RoleGuard>
  )
}

