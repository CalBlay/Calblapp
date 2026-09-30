export const ALL_PISSARRA_PERSONNEL = '__all__'

type LogisticsPersonItem = {
  workers?: string[]
  vehicles?: Array<{ conductor?: string }>
}

export function normalizePissarraPersonName(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function getLogisticsPersonnelNames(item: LogisticsPersonItem) {
  const names = [
    ...(Array.isArray(item.workers) ? item.workers : []),
    ...(Array.isArray(item.vehicles)
      ? item.vehicles.map((vehicle) => vehicle?.conductor || '')
      : []),
  ]

  const unique = new Map<string, string>()
  names.forEach((name) => {
    const cleanName = String(name || '').trim()
    const normalizedName = normalizePissarraPersonName(cleanName)
    if (normalizedName && !unique.has(normalizedName)) {
      unique.set(normalizedName, cleanName)
    }
  })

  return Array.from(unique.values())
}

export function logisticsItemIncludesPerson(
  item: LogisticsPersonItem,
  selectedPerson: string
) {
  if (selectedPerson === ALL_PISSARRA_PERSONNEL) return true
  const selected = normalizePissarraPersonName(selectedPerson)
  if (!selected) return true

  return getLogisticsPersonnelNames(item).some(
    (name) => normalizePissarraPersonName(name) === selected
  )
}

export function defaultPissarraPersonnelFilter({
  role,
  department,
  userName,
}: {
  role?: string | null
  department?: string | null
  userName?: string | null
}) {
  const isLogisticsWorker =
    normalizePissarraPersonName(role) === 'treballador' &&
    normalizePissarraPersonName(department) === 'logistica'
  const cleanUserName = String(userName ?? '').trim()

  return isLogisticsWorker && cleanUserName
    ? cleanUserName
    : ALL_PISSARRA_PERSONNEL
}
