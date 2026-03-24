export type OneDriveEventFile = {
  id: string
  name: string
  url: string | null
  path: string | null
}

export async function listEventFiles(_eventId: string): Promise<OneDriveEventFile[]> {
  return []
}
