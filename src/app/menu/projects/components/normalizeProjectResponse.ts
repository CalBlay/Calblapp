import { EMPTY_KICKOFF, applyDependencyLocksToBlocks, deriveBlockStatus, deriveProjectPhase, type ProjectData } from './project-shared'

export type ProjectApiResponse = {
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
  createdAt?: number
}

export function normalizeProjectResponse(data: ProjectApiResponse): ProjectData {
  const kickoffSource = data.kickoff || {}

  return {
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
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined,
    phase:
      data.phase ||
      deriveProjectPhase({
        launchDate: data.launchDate || '',
        kickoff: {
          ...EMPTY_KICKOFF,
          ...kickoffSource,
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
    blocks: (() => {
      const mappedBlocks = Array.isArray(data.blocks)
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
            outlookEventId: block.outlookEventId || '',
            outlookEventWebLink: block.outlookEventWebLink || '',
            outlookEventEmail: block.outlookEventEmail || '',
            tasks: Array.isArray((block as { tasks?: ProjectData['blocks'][number]['tasks'] }).tasks)
              ? ((block as { tasks?: ProjectData['blocks'][number]['tasks'] }).tasks || []).map(
                  (task) => ({
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
                    outlookEventId: task.outlookEventId || '',
                    outlookEventWebLink: task.outlookEventWebLink || '',
                    outlookEventEmail: task.outlookEventEmail || '',
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
                  })
                )
              : [],
          }))
        : []

      return applyDependencyLocksToBlocks(mappedBlocks).map((block) => ({
        ...block,
        status: deriveBlockStatus(block),
      }))
    })(),
    rooms: Array.isArray(data.rooms)
      ? data.rooms.map((room) => ({
          id: room.id || `room-${Date.now()}`,
          name: room.name || '',
          kind:
            room.kind === 'general'
              ? 'general'
              : room.kind === 'manual'
                ? 'manual'
                : 'block',
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
      ...kickoffSource,
      attendees: Array.isArray(kickoffSource.attendees)
        ? kickoffSource.attendees.map((item) => ({
            key: item.key || '',
            department: item.department || '',
            userId: item.userId || '',
            name: item.name || '',
            email: item.email || '',
            attended: item.attended !== false,
          }))
        : [],
      excludedKeys: Array.isArray(kickoffSource.excludedKeys)
        ? kickoffSource.excludedKeys.map(String)
        : [],
    },
  }
}
