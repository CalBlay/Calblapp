'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { FileText, Paperclip, Plus, Save } from 'lucide-react'
import ChannelChatHeader from '@/components/messaging/ChannelChatHeader'
import ChannelParticipantsPanel from '@/components/messaging/ChannelParticipantsPanel'
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
import { PROJECT_MODULE_ROLES } from '../../../components/project-access'
import {
  GENERAL_ROOM_LABEL,
} from '../../../components/project-room-ui'
import { colorByDepartment } from '@/lib/colors'
import ProjectTaskQuickComposer from '../../../components/ProjectTaskQuickComposer'
import ProjectRoomOpsChat from '../../../components/ProjectRoomOpsChat'
import ProjectWorkspaceShell from '../../../components/ProjectWorkspaceShell'
import {
  clampProjectDeadline,
  formatProjectDate,
  getBlockDepartments,
  getPreLaunchDeadline,
  getPrimaryBlockDepartment,
  type ProjectData,
} from '../../../components/project-shared'
import ProjectTaskCard from '../../../components/ProjectTaskCard'

import type { InviteUserOption } from '@/lib/messaging/userSearch'
import { compressRasterImageForUpload } from '@/lib/file-optimization'
import { fillRoomInitialDocumentUploadForm } from '@/lib/projects/roomInitialDocumentUpload'

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

type SessionUser = {
  id?: string
  name?: string
  role?: string
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
  const router = useRouter()
  const { data: session } = useSession()
  const sessionUser = (session?.user || {}) as SessionUser
  const sessionUserId = String(sessionUser.id || '').trim()
  const sessionUserName = String(sessionUser.name || '').trim()
  const sessionRole = normalizeRole(String(sessionUser.role || '').trim())
  const [project, setProject] = useState<ProjectResponse | null>(null)
  const [users, setUsers] = useState<UserOption[]>([])
  const [error, setError] = useState('')
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
  const [editingLinkedTaskId, setEditingLinkedTaskId] = useState<string | null>(null)
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

        const [roomRes, usersRes] = await Promise.all([
          fetch(`/api/projects/${params.id}/rooms/${params.roomId}`, {
            cache: 'no-store',
          }),
          fetch('/api/users?view=project-options', { cache: 'no-store' }),
        ])

        if (!roomRes.ok) {
          const payload = (await roomRes.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || 'No s ha pogut carregar la sala')
        }

        const payload = (await roomRes.json()) as RoomDetailResponse
        const usersPayload = usersRes.ok
          ? ((await usersRes.json().catch(() => [])) as UserOption[])
          : []

        if (cancelled) return

        setProject(payload.project)
        setUsers(
          (Array.isArray(usersPayload) ? usersPayload : [])
            .map((user) => ({
              id: String(user.id || ''),
              name: String(user.name || '').trim(),
              department: String(user.department || '').trim(),
              role: String(user.role || '').trim(),
            }))
            .filter((user) => user.name)
        )
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
  const linkedTasks = useMemo(
    () => currentBlock?.tasks || [],
    [currentBlock?.tasks]
  )
  const roomResponsibleName = currentBlock?.owner || project?.owner || ''
  const normalizeText = (value?: string | null) =>
    String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()
  const isProjectOwner =
    (sessionUserId && sessionUserId === String(project?.ownerUserId || '').trim()) ||
    normalizeText(sessionUserName) === normalizeText(project?.owner || '')
  const isProjectSponsor =
    (sessionUserId && sessionUserId === String(project?.createdById || '').trim()) ||
    normalizeText(sessionUserName) === normalizeText(project?.sponsor || '')
  const canCreateTaskFromChat =
    !!currentBlock &&
    !!currentRoom &&
    currentRoom.opsChannelSource === 'projects' &&
    (
      sessionRole === 'admin' ||
      isProjectOwner ||
      isProjectSponsor ||
      normalizeText(sessionUserName) === normalizeText(currentBlock?.owner || '')
    )
  const canManageLinkedTasks =
    !!currentBlock &&
    (
      sessionRole === 'admin' ||
      isProjectOwner ||
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
  const _blockDaysLeft = dayDiffFromToday(currentBlock?.deadline)
  const generalRoom = useMemo(
    () => project?.rooms?.find((item) => item.kind === 'general') || null,
    [project?.rooms]
  )

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

  const inviteUsers = useMemo<InviteUserOption[]>(
    () =>
      participantOptions.map((user) => ({
        id: user.id,
        name: user.name,
        department: user.department,
        role: user.role,
      })),
    [participantOptions]
  )

  const participantMembers = useMemo(
    () =>
      (currentRoom?.participantDetails || []).map((participant) => ({
        userId: participant.name,
        userName: participant.name,
        department: participant.department,
        role: participant.role,
        isResponsible:
          roomResponsibleName.length > 0 &&
          participant.name.trim().toLowerCase() === roomResponsibleName.toLowerCase(),
        canRemove: true,
      })),
    [currentRoom?.participantDetails, roomResponsibleName]
  )

  const inviteExcludeIds = useMemo(() => {
    const participantNames = new Set(
      (currentRoom?.participants || []).map((name) => name.trim().toLowerCase())
    )
    return new Set(
      users
        .filter((user) => participantNames.has(user.name.trim().toLowerCase()))
        .map((user) => user.id)
        .filter(Boolean)
    )
  }, [currentRoom?.participants, users])

  const roomTaskResponsibleOptions = useMemo(() => {
    if (!currentBlock) return []

    const allowedDepartments = new Set(
      getBlockDepartments(currentBlock).map((department) => normalizeText(department))
    )

    const filtered = users.filter((user) => {
      if (!user.name) return false
      if (
        normalizeText(user.name) === normalizeText(currentBlock.owner) ||
        normalizeText(user.name) === normalizeText(project?.owner || '') ||
        normalizeText(user.name) === normalizeText(project?.sponsor || '')
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
  }, [currentBlock, project?.owner, project?.sponsor, users])

  const updateRoomLocal = useCallback((updater: (currentRoom: ResolvedRoom) => ResolvedRoom) => {
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
  }, [fallbackRoom, params?.roomId])

  const persistRoom = useCallback(async (
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
  }, [params?.id, params?.roomId, updateRoomLocal])

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
  }, [currentRoom, params?.id, params?.roomId, updateRoomLocal])

  const updateBlockTasksLocal = useCallback((tasks: NonNullable<typeof linkedBlock>['tasks']) => {
    setProject((current) => {
      if (!current || !currentRoom?.blockId) return current
      return {
        ...current,
        blocks: (current.blocks || []).map((block) =>
          block.id === currentRoom.blockId ? { ...block, tasks } : block
        ),
      }
    })
  }, [currentRoom?.blockId])

  const addParticipantFromInvite = async (user: InviteUserOption) => {
    if (!currentRoom || !user.name) return
    const nextRoom = {
      ...currentRoom,
      participants: [...new Set([...(currentRoom.participants || []), user.name])],
      participantDetails: [
        ...(currentRoom.participantDetails || []),
        {
          name: user.name,
          department: user.department || '',
          role: user.role || '',
        },
      ].filter(
        (participant, index, array) =>
          array.findIndex((item) => item.name === participant.name) === index
      ),
    }
    updateRoomLocal(() => nextRoom)
    await persistRoom(nextRoom)
    toast({ title: 'Participant afegit' })
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
      let fileToSend = pendingDocument
      if (pendingDocument.type.startsWith('image/')) {
        try {
          fileToSend = await compressRasterImageForUpload(pendingDocument)
        } catch {
          toast({
            title: 'Error amb la imatge',
            description: 'No s ha pogut comprimir la imatge.',
            variant: 'destructive',
          })
          return
        }
      }
      const form = new FormData()
      form.set('file', fileToSend)

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
      let fileToSend = pendingDocument
      if (pendingDocument.type.startsWith('image/')) {
        try {
          fileToSend = await compressRasterImageForUpload(pendingDocument)
        } catch {
          toast({
            title: 'Error amb la imatge',
            description: 'No s ha pogut comprimir la imatge.',
            variant: 'destructive',
          })
          return
        }
      }
      const form = fillRoomInitialDocumentUploadForm(
        new FormData(),
        fileToSend,
        pendingDocument.name
      )

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

  const updateLinkedTaskField = useCallback(
    <K extends keyof NonNullable<typeof linkedTasks>[number]>(
      taskId: string,
      field: K,
      value: NonNullable<typeof linkedTasks>[number][K]
    ) => {
      if (!currentBlock) return
      const nextTasks = (currentBlock.tasks || []).map((task) =>
        task.id === taskId ? { ...task, [field]: value } : task
      )
      updateBlockTasksLocal(nextTasks)
    },
    [currentBlock, updateBlockTasksLocal]
  )

  const saveLinkedTasks = useCallback(async () => {
    if (!currentRoom || !currentBlock) return
    await persistRoom(currentRoom, currentBlock.tasks || [])
    toast({ title: 'Tasca actualitzada' })
  }, [currentBlock, currentRoom, persistRoom])

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
    <RoleGuard allowedRoles={[...PROJECT_MODULE_ROLES]}>
      <div className="flex min-h-[calc(100vh-72px)] w-full max-w-none flex-col gap-3 overflow-hidden">
        {project ? (
          <ProjectWorkspaceShell
            project={project}
            activeTab="blocks"
            onTabChange={(tab) => router.push(`/menu/projects/${params?.id}?tab=${tab}`)}
            canAccessGeneralRoom={Boolean(generalRoom)}
            onOpenCoordination={() => {
              if (generalRoom) router.push(`/menu/projects/${params?.id}/rooms/${generalRoom.id}`)
            }}
          />
        ) : null}

        <div className="flex flex-1 min-h-0 flex-col gap-3 p-3">

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

            <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="text-lg font-semibold text-slate-900">{currentRoom.name}</div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      currentRoom.kind === 'general'
                        ? 'bg-emerald-100 text-emerald-700'
                        : currentRoom.kind === 'block'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-violet-100 text-violet-700'
                    }`}
                  >
                    {currentRoom.kind === 'block'
                        ? 'Sala del bloc'
                        : currentRoom.kind === 'general'
                          ? GENERAL_ROOM_LABEL
                          : 'Sala manual'}
                  </span>

                  {currentRoom.departments.length > 0
                    ? currentRoom.departments.map((department) => (
                        <span
                          key={`${currentRoom.id}-${department}`}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${colorByDepartment(department)}`}
                        >
                          {department}
                        </span>
                      ))
                    : null}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">Responsable bloc</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {currentBlock?.owner || 'Sense responsable'}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">Data bloc</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                    {formatProjectDate(currentBlock?.deadline)}
                  </span>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:flex-1 xl:min-h-0 xl:grid-cols-[0.78fr_0.62fr_1.15fr]">
              <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-6 xl:min-h-0 xl:overflow-auto">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/menu/projects/${params?.id}?tab=tasks`}
                    className="text-sm font-semibold text-slate-900 hover:text-violet-700"
                  >
                    Tasques vinculades
                  </Link>
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

                {linkedTasks.length > 0 && currentBlock ? (
                  <div className="space-y-2">
                    {linkedTasks.map((task) => (
                      <ProjectTaskCard
                        key={task.id}
                        task={task}
                        block={currentBlock}
                        showBlockName={false}
                        titleHref={`/menu/projects/${params?.id}?tab=tasks&blockId=${encodeURIComponent(currentBlock.id)}&taskId=${encodeURIComponent(task.id)}`}
                        isExpanded={editingLinkedTaskId === task.id}
                        canExpand={canManageLinkedTasks}
                        canManage={canManageLinkedTasks}
                        canAccessOps={canManageLinkedTasks}
                        projectBlocks={project?.blocks || []}
                        maxDeadline={getPreLaunchDeadline(project?.launchDate) || undefined}
                        taskResponsibleOptions={() =>
                          roomTaskResponsibleOptions.map((option) => ({
                            id: option.id,
                            name: option.name,
                            role: '',
                            email: '',
                            department: '',
                          }))
                        }
                        onToggleExpand={() => {
                          setEditingLinkedTaskId((current) => (current === task.id ? null : task.id))
                        }}
                        onSetField={(field, value) => {
                          updateLinkedTaskField(task.id, field, value)
                        }}
                        expandedFooter={
                          canManageLinkedTasks ? (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                className="bg-violet-600 text-white hover:bg-violet-700"
                                onClick={async () => {
                                  await saveLinkedTasks()
                                  setEditingLinkedTaskId(null)
                                }}
                                disabled={saving}
                              >
                                Guardar canvis
                              </Button>
                            </div>
                          ) : null
                        }
                      />
                    ))}
                  </div>
                ) : linkedTasks.length > 0 ? null : (
                  <div className="text-sm text-slate-500">Aquesta sala encara no te tasques vinculades.</div>
                )}

                {currentBlock ? (
                  <div className="flex justify-end pt-1">
                    <Button
                      type="button"
                      size="icon"
                      className="rounded-full bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => setShowTaskComposer((current) => !current)}
                      title="Afegir tasca"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </section>

              <div className="space-y-4 xl:min-h-0 xl:overflow-auto">
                <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-6">
                  <Link
                  href={`/menu/projects/${params?.id}?tab=tracking`}
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

              <section className="flex min-h-[560px] flex-col rounded-[24px] border border-slate-200 bg-white xl:min-h-0">
                <ChannelChatHeader
                  channelTitle="Conversa"
                  channelSubtitle={project?.name || undefined}
                  avatarLabel={currentRoom?.name || 'Conversa'}
                  participantsOpen={participantsOpen}
                  onToggleParticipants={() => setParticipantsOpen((current) => !current)}
                  canInvite
                  inviteUsers={inviteUsers}
                  inviteExcludeIds={inviteExcludeIds}
                  onInvite={(user) => void addParticipantFromInvite(user)}
                  inviteAdding={saving}
                />

                {participantsOpen ? (
                  <ChannelParticipantsPanel
                    members={participantMembers}
                    canManage
                    onRemove={(userId) => void removeParticipant(userId)}
                  />
                ) : null}

                {currentRoom.opsChannelId ? (
                  <ProjectRoomOpsChat
                    channelId={currentRoom.opsChannelId}
                    userId={sessionUserId}
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
            </div>

            </div>
          ) : null}
        </div>
      </div>
    </RoleGuard>
  )
}
