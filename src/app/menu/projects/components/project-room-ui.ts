export const BLOCK_WORKSPACE_LABEL = 'Espai de treball'
export const BLOCK_WORKSPACE_OPEN_LABEL = 'Obrir espai de treball'
export const BLOCK_WORKSPACE_BADGE_LABEL = 'Sala'
export const GENERAL_ROOM_LABEL = 'Coordinació general'
export const MISSATGERIA_OPEN_LABEL = 'Obrir a Ops'

export const buildMissatgeriaChannelHref = (channelId: string) =>
  `/menu/missatgeria?channel=${encodeURIComponent(channelId)}`

export const buildProjectRoomHref = (projectId: string, roomId: string) =>
  `/menu/projects/${projectId}/rooms/${roomId}`

export const buildGeneralRoomHref = (projectId: string) =>
  buildProjectRoomHref(projectId, `room-general-${projectId}`)
