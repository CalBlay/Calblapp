type TemplateSiteInput = {
  center?: unknown
  location?: unknown
  zone?: unknown
}

const clean = (value: unknown) => String(value || '').trim()

export type MaintenanceTemplateSite = {
  center: string
  location: string
  zone: string
}

export function normalizeMaintenanceTemplateSite(
  value: TemplateSiteInput | Record<string, unknown> | null | undefined
): MaintenanceTemplateSite {
  const record = value && typeof value === 'object' ? value : {}
  const center = clean(record.center)
  const rawLocation = clean(record.location)
  const hasZoneField = Object.prototype.hasOwnProperty.call(record, 'zone')
  const zone = clean(record.zone)

  if (center || hasZoneField) {
    return {
      center,
      location: rawLocation,
      zone,
    }
  }

  return {
    center: '',
    location: '',
    zone: rawLocation,
  }
}

export function buildMaintenanceTemplateSitePayload(site: TemplateSiteInput) {
  return {
    center: clean(site.center),
    location: clean(site.location),
    zone: clean(site.zone),
  }
}

export function formatMaintenanceTemplateSite(site: TemplateSiteInput) {
  return [clean(site.center), clean(site.location), clean(site.zone)].filter(Boolean).join(' / ')
}
