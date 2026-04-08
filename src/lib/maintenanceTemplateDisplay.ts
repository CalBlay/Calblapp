type SectionLike = { location?: string; items?: Array<{ label?: string }> }

/**
 * Nom visible per a plantilles preventives: camps legacy / importacions i fallback
 * a la primera tasca o a l'id del document.
 */
export function resolveMaintenanceTemplateName(
  data: Record<string, unknown>,
  docId: string,
  normalizedSections: SectionLike[]
): string {
  const trim = (v: unknown) => String(v ?? '').trim()
  for (const key of ['name', 'Name', 'nom', 'Nom', 'title', 'Title', 'label', 'Label']) {
    const s = trim(data[key])
    if (s) return s
  }
  for (const sec of normalizedSections) {
    for (const item of sec.items || []) {
      const label = trim(item?.label)
      if (label) return label
    }
  }
  const shortId = docId.length > 14 ? `${docId.slice(0, 10)}…` : docId
  return `Sense nom (${shortId})`
}

/** Fallback en UI si el nom arriba buit (cache antiga, etc.). */
export function displayMaintenanceTemplateName(template: { name?: string; id: string }): string {
  const t = String(template.name ?? '').trim()
  if (t) return t
  return resolveMaintenanceTemplateName({}, template.id, [])
}
