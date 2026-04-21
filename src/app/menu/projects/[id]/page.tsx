'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import ProjectWorkspace from '../components/ProjectWorkspace'
import { EMPTY_KICKOFF, deriveProjectPhase, type ProjectData } from '../components/project-shared'
import type { WorkspaceTab } from '../components/project-workspace-helpers'

type ProjectResponse = {
  id: string
  name?: string
  sponsor?: string
  owner?: string
  ownerUserId?: string
  createdById?: string
  context?: string
  strategy?: string
  risks?: string
  startDate?: string
  launchDate?: string
  budget?: string
  phase?: string
  status?: string
  departments?: string[]
  blocks?: ProjectData['blocks']
  sprints?: ProjectData['sprints']
  rooms?: ProjectData['rooms']
  document?: ProjectData['document']
  documents?: ProjectData['documents']
  kickoff?: Partial<ProjectData['kickoff']> | null
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const [project, setProject] = useState<ProjectData | null>(null)
  const [error, setError] = useState('')
  const requestedTab = searchParams?.get('tab')
  const initialTab: WorkspaceTab =
    requestedTab === 'blocks' ||
    requestedTab === 'tasks' ||
    requestedTab === 'documents' ||
    requestedTab === 'rooms' ||
    requestedTab === 'tracking'
      ? requestedTab
      : 'overview'

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const id = params?.id
        if (!id) throw new Error('Projecte no trobat')

        const res = await fetch(`/api/projects/${id}`, { cache: 'no-store' })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || 'No s ha pogut carregar el projecte')
        }

        const data = (await res.json()) as ProjectResponse
        if (cancelled) return

        setProject({
          id: data.id,
          name: data.name || '',
          sponsor: data.sponsor || '',
          owner: data.owner || '',
          ownerUserId: data.ownerUserId || '',
          createdById: data.createdById || '',
          context: data.context || '',
          strategy: data.strategy || '',
          risks: data.risks || '',
          startDate: data.startDate || '',
          launchDate: data.launchDate || '',
          budget: data.budget || '',
          phase:
            data.phase ||
            deriveProjectPhase({
              launchDate: data.launchDate || '',
              kickoff: {
                ...EMPTY_KICKOFF,
                ...(data.kickoff || {}),
              },
              blocks: Array.isArray(data.blocks) ? data.blocks : [],
            }),
          status: data.status || '',
          departments: Array.isArray(data.departments) ? data.departments : [],
          sprints: Array.isArray(data.sprints)
            ? data.sprints.map((sprint) => ({
                id: String(sprint.id || `sprint-${Date.now()}`),
                name: String(sprint.name || ''),
                goal: String(sprint.goal || ''),
                startDate: String(sprint.startDate || ''),
                endDate: String(sprint.endDate || ''),
                status:
                  sprint.status === 'active' || sprint.status === 'closed' || sprint.status === 'planned'
                    ? sprint.status
                    : 'planned',
              }))
            : [],
          blocks: Array.isArray(data.blocks)
            ? data.blocks.map((block) => ({
                id: block.id || `block-${Date.now()}`,
                name: block.name || '',
                summary: block.summary || '',
                department: block.department || '',
                departments: Array.isArray((block as { departments?: string[] }).departments)
                  ? ((block as { departments?: string[] }).departments || []).map(String)
                  : block.department
                    ? [String(block.department)]
                    : [],
                owner: block.owner || '',
                deadline: block.deadline || '',
                budget: String(block.budget || ''),
                dependsOn: block.dependsOn || '',
                status: block.status || 'pending',
                tasks: Array.isArray((block as { tasks?: ProjectData['blocks'][number]['tasks'] }).tasks)
                    ? ((block as { tasks?: ProjectData['blocks'][number]['tasks'] }).tasks || []).map((task) => ({
                      id: task.id || `task-${Date.now()}`,
                      title: task.title || '',
                      description: task.description || '',
                      department: task.department || '',
                      owner: task.owner || '',
                      deadline: task.deadline || '',
                      dependsOn: task.dependsOn || '',
                      sprintId: task.sprintId || '',
                      storyPoints: task.storyPoints || '3',
                      cost: task.cost || '',
                      priority: task.priority || 'normal',
                      status: task.status || 'pending',
                      documents: Array.isArray(task.documents)
                        ? task.documents.map((item, index) => ({
                            id: item?.id || `task-doc-${index}-${Date.now()}`,
                            category: item?.category || 'other',
                            label: item?.label || item?.name || '',
                            name: item?.name || '',
                            path: item?.path || '',
                            url: item?.url || '',
                            size: item?.size || 0,
                            type: item?.type || '',
                          }))
                        : [],
                    }))
                  : [],
              }))
            : [],
          rooms: Array.isArray(data.rooms)
            ? data.rooms.map((room) => ({
                id: room.id || `room-${Date.now()}`,
                name: room.name || '',
                kind: room.kind === 'manual' ? 'manual' : 'block',
                blockId: room.blockId || '',
                opsChannelId: room.opsChannelId ? String(room.opsChannelId) : '',
                opsChannelName: room.opsChannelName ? String(room.opsChannelName) : '',
                opsChannelSource: room.opsChannelSource === 'projects' ? 'projects' : undefined,
                opsSyncedAt: Number(room.opsSyncedAt || 0) || undefined,
                departments: Array.isArray(room.departments) ? room.departments.map(String) : [],
                participants: Array.isArray(room.participants) ? room.participants.map(String) : [],
                participantDetails: Array.isArray(room.participantDetails)
                  ? room.participantDetails.map((detail) => ({
                      name: String(detail.name || ''),
                      department: String(detail.department || ''),
                      role: String(detail.role || ''),
                    }))
                  : [],
                notes: String(room.notes || ''),
                documents: Array.isArray(room.documents)
                  ? room.documents.map((item, index) => ({
                      id: item?.id || `room-doc-${index}-${Date.now()}`,
                      category: item?.category || 'other',
                      label: item?.label || item?.name || '',
                      name: item?.name || '',
                      path: item?.path || '',
                      url: item?.url || '',
                      size: item?.size || 0,
                      type: item?.type || '',
                    }))
                  : [],
                messages: Array.isArray(room.messages)
                  ? room.messages.map((message) => ({
                      id: String(message.id || `msg-${Date.now()}`),
                      author: String(message.author || ''),
                      text: String(message.text || ''),
                      createdAt: Number(message.createdAt || 0),
                    }))
                  : [],
              }))
            : [],
          document: data.document || null,
          documents: Array.isArray(data.documents)
            ? data.documents.map((item, index) => ({
                id: item?.id || `doc-${index}-${Date.now()}`,
                category: item?.category || 'general',
                label: item?.label || item?.name || '',
                name: item?.name || '',
                path: item?.path || '',
                url: item?.url || '',
                size: item?.size || 0,
                type: item?.type || '',
              }))
            : data.document
              ? [
                  {
                    id: `doc-initial-${Date.now()}`,
                    category: 'initial',
                    label: data.document.name || 'Document inicial',
                    name: data.document.name || '',
                    path: data.document.path || '',
                    url: data.document.url || '',
                    size: data.document.size || 0,
                    type: data.document.type || '',
                  },
                ]
              : [],
          kickoff: {
            ...EMPTY_KICKOFF,
            ...(data.kickoff || {}),
                attendees: Array.isArray(data.kickoff?.attendees)
                  ? data.kickoff.attendees.map((item) => ({
                      key: item.key || '',
                      department: item.department || '',
                      userId: item.userId || '',
                      name: item.name || '',
                      email: item.email || '',
                      attended: item.attended !== false,
                    }))
                  : [],
            excludedKeys: Array.isArray(data.kickoff?.excludedKeys)
              ? data.kickoff.excludedKeys.map(String)
              : [],
          },
        })
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error carregant el projecte')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params])
  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="flex w-full max-w-none flex-col gap-6 p-4">
        <ModuleHeader
          title="Projectes"
          subtitle={project?.name || 'Projecte'}
          mainHref="/menu/projects"
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!project && !error ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
            Carregant projecte...
          </div>
        ) : null}

        {project ? (
          <ProjectWorkspace projectId={params?.id || ''} initialProject={project} initialTab={initialTab} />
        ) : null}
      </div>
    </RoleGuard>
  )
}
