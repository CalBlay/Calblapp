import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { readLegacyExternalWorkersFromDoc } from '@/lib/legacyExternalWorkers'
import { queryQuadrantCollectionDocsInDateRange } from '@/lib/firestoreQuadrantsRangeQuery'
import { resolveQuadrantCollection } from '@/lib/firestoreCollections'

const normalizeEventId = (value?: string | null): string =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

const hasFirestoreToDate = (v: unknown): v is { toDate: () => Date } =>
  typeof v === 'object' &&
  v !== null &&
  'toDate' in v &&
  typeof (v as { toDate?: unknown }).toDate === 'function'

const formatDayField = (primary: unknown, ...fallbacks: unknown[]): string => {
  if (hasFirestoreToDate(primary)) return primary.toDate().toISOString().slice(0, 10)
  if (typeof primary === 'string' && primary) return primary
  for (const f of fallbacks) {
    if (hasFirestoreToDate(f)) return f.toDate().toISOString().slice(0, 10)
    if (typeof f === 'string' && f) return f
  }
  return ''
}

type LegacyExternalEntry = {
  workers?: unknown
  name?: unknown
  meetingPoint?: unknown
  startDate?: unknown
  startTime?: unknown
  endDate?: unknown
  endTime?: unknown
  arrivalTime?: unknown
}

const expandLegacyExternalWorkers = (entries: LegacyExternalEntry[] = []) =>
  entries.flatMap((entry) => {
    const count = Math.max(1, Number(entry?.workers || 0))
    const baseName = String(entry?.name || 'ETT').trim() || 'ETT'
    return Array.from({ length: count }, () => ({
      id: '',
      name: baseName,
      meetingPoint: entry?.meetingPoint || '',
      startDate: entry?.startDate || '',
      startTime: entry?.startTime || '',
      endDate: entry?.endDate || '',
      endTime: entry?.endTime || '',
      arrivalTime: entry?.arrivalTime || '',
      plate: '',
      vehicleType: '',
      isExternal: true,
    }))
  })

async function resolveReadCollectionForDepartment(department: string) {
  return resolveQuadrantCollection(department, { prefer: 'singular' })
}

export async function computeQuadrantsGet(
  start: string,
  end: string,
  departmentNormalized: string
): Promise<{ quadrants: Record<string, unknown>[] }> {
  const colName = await resolveReadCollectionForDepartment(departmentNormalized)
  const collectionRef = db.collection(colName)

  console.log('[quadrants/get] Consulta:', {
    colName,
    start,
    end,
    department: departmentNormalized,
  })

  const { docs: rangeDocs, usedFullCollectionScan } =
    await queryQuadrantCollectionDocsInDateRange(collectionRef, start, end)
  if (usedFullCollectionScan) {
    console.warn('[quadrants/get] Lectura completa de col·lecció (revisa índexs Firestore)')
  }

  console.log('[quadrants/get] Documents trobats:', rangeDocs.length)

  const results = rangeDocs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>

      const legacyExternalWorkers = expandLegacyExternalWorkers(
        readLegacyExternalWorkersFromDoc(d)
      )
      const treballadors = [
        ...(Array.isArray(d.treballadors) ? d.treballadors : []),
        ...legacyExternalWorkers,
      ]

      const allRows: unknown[] = [
        d.responsable ? d.responsable : null,
        ...(Array.isArray(d.conductors) ? d.conductors : []),
        ...treballadors,
      ].filter(Boolean)

      const rowTime = (r: unknown, key: 'startTime' | 'endTime') => {
        if (typeof r === 'object' && r !== null && key in r) {
          const v = (r as Record<string, unknown>)[key]
          return typeof v === 'string' ? v : v != null ? String(v) : ''
        }
        return ''
      }

      const startTimes = allRows
        .map((r) => rowTime(r, 'startTime'))
        .filter(Boolean)
        .sort()

      const endTimes = allRows
        .map((r) => rowTime(r, 'endTime'))
        .filter(Boolean)
        .sort()

      const derivedStartTime = startTimes.length > 0 ? startTimes[0] : null
      const derivedEndTime = endTimes.length > 0 ? endTimes[endTimes.length - 1] : null

      const codeRaw = d.code ?? d.eventCode ?? d.eventId ?? doc.id
      const code = typeof codeRaw === 'string' ? codeRaw : String(codeRaw ?? '')
      const eventId = normalizeEventId(
        (typeof d.eventId === 'string' ? d.eventId : String(d.eventId ?? '')) || code || doc.id
      )

      return {
        id: doc.id,
        eventId,
        code,
        eventCode: code,
        eventName: d.eventName || d.name || '',
        location: d.location || d.finca || '',
        meetingPoint: d.meetingPoint || '',
        arrivalTime: d.arrivalTime || '',
        startDate: formatDayField(d.startDate, d.phaseDate),
        endDate: formatDayField(d.endDate, d.phaseDate, d.startDate),
        startTime: derivedStartTime || d.startTime || '',
        endTime: derivedEndTime || d.endTime || '',
        responsables: Array.isArray(d.responsables) ? d.responsables : [],
        conductors: Array.isArray(d.conductors) ? d.conductors : [],
        treballadors,
        responsableId: String(d.responsableId || '').trim() || null,
        responsable: d.responsable
          ? {
              id: String((d.responsable as { id?: string }).id || d.responsableId || '').trim(),
              name: String((d.responsable as { name?: string }).name || ''),
              meetingPoint: String((d.responsable as { meetingPoint?: string }).meetingPoint || ''),
            }
          : d.responsableId || d.responsableName
          ? {
              id: String(d.responsableId || '').trim(),
              name: String(d.responsableName || ''),
              meetingPoint: String(d.meetingPoint || ''),
            }
          : null,
        responsableName:
          Array.isArray(d.responsables) && d.responsables.length > 0
            ? (d.responsables as Array<{ name?: string }>).map((r) => r.name).join(', ')
            : String(d.responsableName || '') ||
              String((d.responsable as { name?: string } | undefined)?.name || ''),
        pax: d.pax || d.numPax || 0,
        dressCode: d.dressCode || '',
        vestimentModel:
          typeof d.vestimentModel === 'string'
            ? d.vestimentModel
            : typeof d.dressCode === 'string'
            ? d.dressCode
            : '',
        department: departmentNormalized,
        service: d.service || d.servei || d.eventService || null,
        phaseType: d.phaseType || d.phaseLabel || '',
        phaseLabel: d.phaseLabel || '',
        phaseDate: d.phaseDate || '',
        commercial: d.commercial || null,
        totalWorkers: Number(d.totalWorkers || 0),
        numDrivers: Number(d.numDrivers || 0),
        groups: Array.isArray(d.groups)
          ? d.groups.map(
              (g: {
                id?: string | null
                serviceDate?: string
                dateLabel?: string
                meetingPoint?: string
                startTime?: string
                arrivalTime?: string | null
                endTime?: string
                workers?: unknown
                jamoneros?: unknown
                drivers?: unknown
                needsDriver?: boolean
                wantsResponsible?: boolean
                driverId?: string | null
                driverName?: string | null
                responsibleId?: string | null
                responsibleName?: string | null
                manualWorkers?: unknown
              }, idx: number) => ({
              id: g.id || `group-${idx + 1}`,
              serviceDate: g.serviceDate || '',
              dateLabel: g.dateLabel || '',
              meetingPoint: g.meetingPoint || '',
              startTime: g.startTime || '',
              arrivalTime: g.arrivalTime ?? null,
              endTime: g.endTime || '',
              workers: Number(g.workers || 0),
              jamoneros: Number(g.jamoneros || 0),
              drivers: Number(g.drivers || 0),
              needsDriver: !!g.needsDriver,
              wantsResponsible: g.wantsResponsible === true,
              driverId: g.driverId || null,
              driverName: g.driverName || null,
              responsibleId: g.responsibleId || null,
              responsibleName: g.responsibleName || null,
              ...(Array.isArray(g.manualWorkers) ? { manualWorkers: g.manualWorkers } : {}),
            }))
          : undefined,
        status: typeof d.status === 'string' ? d.status.toLowerCase() : '',
        needsReview: d.needsReview === true,
        attentionNotes: Array.isArray(d.attentionNotes) ? d.attentionNotes : [],
        violations: Array.isArray(d.violations) ? d.violations : [],
      }
    })
    .filter((item) => {
      const itemStart = String(item.startDate || item.phaseDate || '').trim()
      const itemEnd = String(item.endDate || item.phaseDate || itemStart).trim()
      if (!itemStart || !itemEnd) return false
      return itemStart <= end && itemEnd >= start
    })

  console.log(`[quadrants/get] Quadrants retornats: ${results.length}`)
  return { quadrants: results }
}
