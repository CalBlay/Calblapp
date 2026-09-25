export type EttEmailSchedule = {
  providerId: string
  providerName: string
  responsibleName: string
  email: string
  department: string
  eventId: string
  eventCode: string
  eventName: string
  location: string
  date: string
  startTime: string
  endTime: string
  meetingPoint: string
  workers: number
}

type QuadrantEmailDoc = Record<string, unknown> & {
  treballadors?: Array<Record<string, unknown>>
}

const text = (value: unknown) => String(value || '').trim()

const formatDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value || 'pendent'
}

export function collectEttEmailSchedules(
  docs: QuadrantEmailDoc[],
  eventId: string,
  department: string
): EttEmailSchedule[] {
  const grouped = new Map<string, EttEmailSchedule>()

  docs.forEach((doc) => {
    if (text(doc.status).toLowerCase() !== 'confirmed' && doc.confirmed !== true && !doc.confirmedAt) {
      return
    }
    const countsInDocument = new Map<string, EttEmailSchedule>()
    ;(Array.isArray(doc.treballadors) ? doc.treballadors : []).forEach((worker) => {
      const workerName = text(worker.name).toLowerCase()
      const isEtt =
        text(worker.externalType).toLowerCase() === 'ett' ||
        (worker.isExternal === true && workerName.startsWith('ett'))
      const email = text(worker.ettEmail).toLowerCase()
      if (!isEtt || !email.includes('@')) return

      const date = text(worker.startDate || doc.phaseDate || doc.startDate).slice(0, 10)
      const startTime = text(worker.startTime || doc.startTime).slice(0, 5)
      const endTime = text(worker.endTime || doc.endTime).slice(0, 5)
      const meetingPoint = text(worker.meetingPoint || doc.meetingPoint || doc.location)
      const providerId = text(worker.ettProviderId)
      const providerName = text(worker.ettProviderName) || 'ETT'
      const responsibleName = text(worker.ettResponsibleName)
      const groupKey = text(worker.ettGroupKey)
      const key = [email, providerId || providerName, groupKey, date, startTime, endTime, meetingPoint].join('::')
      const current = countsInDocument.get(key)
      if (current) {
        current.workers += 1
        return
      }
      countsInDocument.set(key, {
        providerId,
        providerName,
        responsibleName,
        email,
        department,
        eventId,
        eventCode: text(doc.code),
        eventName: text(doc.eventName),
        location: text(doc.location),
        date,
        startTime,
        endTime,
        meetingPoint,
        workers: 1,
      })
    })
    countsInDocument.forEach((schedule, key) => {
      const current = grouped.get(key)
      if (!current || schedule.workers > current.workers) grouped.set(key, schedule)
    })
  })

  return Array.from(grouped.values()).sort((a, b) =>
    `${a.email}${a.date}${a.startTime}`.localeCompare(`${b.email}${b.date}${b.startTime}`)
  )
}

export function buildEttScheduleEmailText(schedules: EttEmailSchedule[]): string {
  const first = schedules[0]
  const greeting = first?.responsibleName ? `Bon dia, ${first.responsibleName},` : 'Bon dia,'
  const eventLabel = [first?.eventCode, first?.eventName].filter(Boolean).join(' · ')
  const scheduleBlocks = schedules.flatMap((row, index) => [
    ...(schedules.length > 1 ? [`Horari ${index + 1}`] : []),
    `Data: ${formatDate(row.date)}`,
    `Núm. treballadors: ${row.workers}`,
    `Lloc: ${row.meetingPoint || row.location || 'pendent'}`,
    `Hora inici: ${row.startTime || 'pendent'}`,
    `Hora fi (estimada): ${row.endTime || 'pendent'}`,
    ...(index < schedules.length - 1 ? [''] : []),
  ])
  return [
    greeting,
    '',
    `Us enviem els horaris del quadrant${eventLabel ? ` de ${eventLabel}` : ''}.`,
    '',
    ...scheduleBlocks,
    '',
    'Si us plau, confirmeu l’assistència, els noms de les persones que aniran al servei i un telèfon de contacte.',
    '',
    'Gràcies.',
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
}
