export function roomParticipantsFingerprint(room: { participants?: unknown }): string {
  return [...(Array.isArray(room.participants) ? room.participants : [])]
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .sort()
    .join('|')
}
