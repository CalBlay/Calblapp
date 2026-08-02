import type { ProjectRoomLike } from '@/lib/projectRoomOps'

export const buildGeneralRoomId = (projectId: string) => `room-general-${projectId}`

export const GENERAL_ROOM_LABEL = 'Coordinació general'

export function deriveGeneralRoomParticipants(data: {
  owner?: string
  sponsor?: string
  blocks?: Array<{ owner?: string }>
  extraParticipants?: string[]
}): string[] {
  return [
    ...new Set(
      [
        String(data.owner || ''),
        String(data.sponsor || ''),
        ...(data.blocks || []).map((block) => String(block.owner || '')),
        ...(data.extraParticipants || []),
      ].filter(Boolean)
    ),
  ]
}

export function buildAutoGeneralRoom(
  data: Record<string, unknown>,
  projectId: string,
  roomId?: string
): ProjectRoomLike | null {
  const id = roomId || buildGeneralRoomId(projectId)
  if (id !== buildGeneralRoomId(projectId)) return null

  const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : []
  const departments = Array.isArray(data.departments)
    ? (data.departments as unknown[]).map(String).filter(Boolean)
    : []
  const rooms = Array.isArray(data.rooms) ? (data.rooms as ProjectRoomLike[]) : []
  const existing = rooms.find((room) => String(room.id || '') === id)

  const participants = deriveGeneralRoomParticipants({
    owner: String(data.owner || ''),
    sponsor: String(data.sponsor || ''),
    blocks: blocks.map((block) => ({ owner: String(block.owner || '') })),
    extraParticipants: Array.isArray(existing?.participants)
      ? (existing.participants as unknown[]).map(String)
      : [],
  })

  return {
    id,
    name: GENERAL_ROOM_LABEL,
    kind: 'general',
    blockId: '',
    opsChannelId: String(existing?.opsChannelId || ''),
    opsChannelName: String(existing?.opsChannelName || GENERAL_ROOM_LABEL),
    opsChannelSource: 'projects',
    opsSyncedAt: Number(existing?.opsSyncedAt || 0),
    departments,
    participants,
    participantDetails: participants.map((name) => ({ name })),
    notes: String(existing?.notes || ''),
    documents: Array.isArray(existing?.documents) ? existing.documents : [],
    messages: [],
  }
}
