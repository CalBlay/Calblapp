export type OpsChannelSource = 'finques' | 'restaurants'

export type OpsChannelLocation = {
  source: OpsChannelSource
  location: string
}

/** Canals OPS pilot (mateix conjunt que messaging/channels/seed). */
export const OPS_CHANNEL_LOCATIONS: OpsChannelLocation[] = [
  { source: 'finques', location: 'Clos la Plana' },
  { source: 'finques', location: 'Josep Massachs' },
  { source: 'finques', location: 'Mirador Events' },
  { source: 'finques', location: 'Font de la Canya' },
  { source: 'finques', location: 'La Masia' },
  { source: 'restaurants', location: 'Mirador' },
  { source: 'restaurants', location: 'Nàutic' },
  { source: 'restaurants', location: 'La Masia' },
  { source: 'restaurants', location: 'Camp Nou' },
  { source: 'restaurants', location: 'Soliver' },
]

export const slugifyOpsLocation = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

const normalizeLocationKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export const getOpsChannelId = (source: OpsChannelSource, location: string) =>
  `${source}_${slugifyOpsLocation(location)}`

export type ResolvedOpsChannel = {
  channelId: string
  intakeChannel: 'restaurant' | 'finca'
  source: OpsChannelSource
  location: string
}

export function resolveOpsChannelByLocationName(
  locationName: string
): ResolvedOpsChannel | null {
  const key = normalizeLocationKey(locationName)
  if (!key) return null

  const match = OPS_CHANNEL_LOCATIONS.find(
    (entry) => normalizeLocationKey(entry.location) === key
  )
  if (!match) return null

  return {
    channelId: getOpsChannelId(match.source, match.location),
    intakeChannel: match.source === 'restaurants' ? 'restaurant' : 'finca',
    source: match.source,
    location: match.location,
  }
}
