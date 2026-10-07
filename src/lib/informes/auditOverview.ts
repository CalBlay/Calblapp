export type AuditReportAnswer = {
  itemId?: string | null
  type?: string | null
  value?: unknown
  photos?: Array<{ url?: string | null }> | null
}

export type AuditReportTemplateBlock = {
  id?: string | null
  title?: string | null
  items?: Array<{ id?: string | null; label?: string | null; type?: string | null }> | null
}

export type AuditReportRun = {
  id: string
  eventId: string
  eventSummary: string
  eventCode: string
  eventLocation: string
  eventDay: string
  department: string
  templateId: string
  templateName: string
  status: string
  completedAt: number
  savedAt: number
  updatedAt: number
  completedById: string
  completedByName: string
  completedByDepartment: string
  reviewedByName: string
  compliancePct: number
  incidentOutcome: string
  incidentIds: string[]
  templateSnapshot: AuditReportTemplateBlock[]
  auditAnswers: AuditReportAnswer[]
}

export type AuditReportIncident = {
  id: string
  status: string
}

export type AuditReportFilters = {
  department?: string
  responsible?: string
  template?: string
  status?: string
  location?: string
  ln?: string
}

export type AuditKpis = {
  started: number
  finalized: number
  validated: number
  validationPct: number
  avgCompliancePct: number
  avgCompletionPct: number
  withIncident: number
  incidentPct: number
  deviationsWithoutIncident: number
}

export type AuditResponsibleRow = {
  id: string
  name: string
  department: string
  audits: number
  sharePct: number
  validated: number
  validationPct: number
  avgCompliancePct: number
  avgCompletionPct: number
  withIncident: number
  deviations: number
  followedDeviations: number
  followUpPct: number | null
}

export type AuditAttentionRow = {
  id: string
  eventSummary: string
  eventCode: string
  eventDay: string
  department: string
  responsible: string
  status: string
  completionPct: number | null
  compliancePct: number | null
  deviations: number
  hasIncident: boolean
  reasons: string[]
}

export type AuditOverview = {
  period: { dateFrom: string; dateTo: string }
  kpis: AuditKpis
  previousKpis: AuditKpis
  trend: Array<{
    day: string
    finalized: number
    validated: number
    avgCompliancePct: number | null
    avgCompletionPct: number | null
  }>
  funnel: Array<{ key: string; label: string; value: number }>
  responsibles: AuditResponsibleRow[]
  attention: AuditAttentionRow[]
  filterOptions: {
    departments: string[]
    responsibles: Array<{ value: string; label: string }>
    templates: Array<{ value: string; label: string }>
    locations: string[]
    lns: string[]
  }
}

const FINAL_STATUSES = new Set(['completed', 'validated', 'rejected'])

export function roundAuditMetric(value: number): number {
  return Math.round(value * 10) / 10
}

export function auditLnFromCode(code?: string | null): string {
  const value = String(code || '').trim().toUpperCase()
  if (value.startsWith('E-')) return 'Empresa'
  if (value.startsWith('C-')) return 'Casaments'
  if (value.startsWith('F-')) return 'Foodlovers'
  if (value.startsWith('PM')) return 'Agenda'
  return ''
}

function answerIsFilled(answer: AuditReportAnswer | undefined, type: string): boolean {
  if (!answer) return false
  if (type === 'photo') {
    return Array.isArray(answer.photos) && answer.photos.some((photo) => Boolean(String(photo?.url || '').trim()))
  }
  if (type === 'rating') {
    const value = Number(answer.value)
    return Number.isFinite(value) && value >= 1 && value <= 10
  }
  return typeof answer.value === 'boolean'
}

export function auditRunQuality(run: AuditReportRun): {
  completionPct: number | null
  deviations: number
} {
  const answers = new Map(
    run.auditAnswers
      .map((answer) => [String(answer.itemId || '').trim(), answer] as const)
      .filter(([itemId]) => Boolean(itemId))
  )
  let total = 0
  let filled = 0
  let deviations = 0

  for (const block of run.templateSnapshot) {
    for (const item of Array.isArray(block.items) ? block.items : []) {
      const itemId = String(item.id || '').trim()
      if (!itemId) continue
      total += 1
      const type = String(item.type || 'checklist').toLowerCase()
      const answer = answers.get(itemId)
      if (answerIsFilled(answer, type)) filled += 1
      if (type === 'checklist' && answer?.value === false) deviations += 1
      if (type === 'rating') {
        const rating = Number(answer?.value)
        if (Number.isFinite(rating) && rating >= 1 && rating <= 6) deviations += 1
      }
    }
  }

  return {
    completionPct: total > 0 ? roundAuditMetric((filled / total) * 100) : null,
    deviations,
  }
}

function reportTimestamp(run: AuditReportRun): number {
  return Number(run.completedAt || run.savedAt || run.updatedAt || 0)
}

function ymdFromTimestamp(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function matchesFilters(run: AuditReportRun, filters: AuditReportFilters): boolean {
  if (filters.department && run.department !== filters.department) return false
  if (filters.responsible) {
    const value = run.completedById || run.completedByName
    if (value !== filters.responsible) return false
  }
  if (filters.template) {
    const value = run.templateId || run.templateName
    if (value !== filters.template) return false
  }
  if (filters.status && run.status !== filters.status) return false
  if (filters.location && run.eventLocation !== filters.location) return false
  if (filters.ln && auditLnFromCode(run.eventCode) !== filters.ln) return false
  return true
}

function inRange(run: AuditReportRun, dateFrom: string, dateTo: string): boolean {
  const day = ymdFromTimestamp(reportTimestamp(run))
  return Boolean(day && day >= dateFrom && day <= dateTo)
}

function calculateKpis(runs: AuditReportRun[]): AuditKpis {
  const finalizedRuns = runs.filter((run) => FINAL_STATUSES.has(run.status))
  const validatedRuns = finalizedRuns.filter((run) => run.status === 'validated')
  const quality = finalizedRuns.map((run) => ({ run, ...auditRunQuality(run) }))
  const completionValues = quality
    .map((row) => row.completionPct)
    .filter((value): value is number => value != null)
  const complianceValues = validatedRuns.map((run) => run.compliancePct).filter(Number.isFinite)
  const withIncident = finalizedRuns.filter(
    (run) => run.incidentOutcome === 'reported' && run.incidentIds.length > 0
  ).length
  const deviationsWithoutIncident = quality.filter(
    ({ run, deviations }) => deviations > 0 && !(run.incidentOutcome === 'reported' && run.incidentIds.length > 0)
  ).length

  return {
    started: runs.length,
    finalized: finalizedRuns.length,
    validated: validatedRuns.length,
    validationPct: finalizedRuns.length ? roundAuditMetric((validatedRuns.length / finalizedRuns.length) * 100) : 0,
    avgCompliancePct: complianceValues.length
      ? roundAuditMetric(complianceValues.reduce((sum, value) => sum + value, 0) / complianceValues.length)
      : 0,
    avgCompletionPct: completionValues.length
      ? roundAuditMetric(completionValues.reduce((sum, value) => sum + value, 0) / completionValues.length)
      : 0,
    withIncident,
    incidentPct: finalizedRuns.length ? roundAuditMetric((withIncident / finalizedRuns.length) * 100) : 0,
    deviationsWithoutIncident,
  }
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ca')
  )
}

export function buildAuditOverview(input: {
  runs: AuditReportRun[]
  incidents: AuditReportIncident[]
  dateFrom: string
  dateTo: string
  previousDateFrom: string
  previousDateTo: string
  filters?: AuditReportFilters
}): AuditOverview {
  const filters = input.filters || {}
  const roleVisibleRuns = input.runs
  const optionRuns = roleVisibleRuns.filter((run) => inRange(run, input.dateFrom, input.dateTo))
  const currentRuns = optionRuns.filter((run) => matchesFilters(run, filters))
  const previousRuns = roleVisibleRuns.filter(
    (run) => inRange(run, input.previousDateFrom, input.previousDateTo) && matchesFilters(run, filters)
  )
  const kpis = calculateKpis(currentRuns)
  const previousKpis = calculateKpis(previousRuns)
  const incidentStatusById = new Map(input.incidents.map((incident) => [incident.id, incident.status]))

  const byDay = new Map<
    string,
    { finalized: number; validated: number; compliance: number[]; completion: number[] }
  >()
  for (const run of currentRuns) {
    if (!FINAL_STATUSES.has(run.status)) continue
    const day = ymdFromTimestamp(reportTimestamp(run))
    if (!day) continue
    const bucket = byDay.get(day) || { finalized: 0, validated: 0, compliance: [], completion: [] }
    bucket.finalized += 1
    const quality = auditRunQuality(run)
    if (quality.completionPct != null) bucket.completion.push(quality.completionPct)
    if (run.status === 'validated') {
      bucket.validated += 1
      if (Number.isFinite(run.compliancePct)) bucket.compliance.push(run.compliancePct)
    }
    byDay.set(day, bucket)
  }
  const trend = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bucket]) => ({
      day,
      finalized: bucket.finalized,
      validated: bucket.validated,
      avgCompliancePct: bucket.compliance.length
        ? roundAuditMetric(bucket.compliance.reduce((sum, value) => sum + value, 0) / bucket.compliance.length)
        : null,
      avgCompletionPct: bucket.completion.length
        ? roundAuditMetric(bucket.completion.reduce((sum, value) => sum + value, 0) / bucket.completion.length)
        : null,
    }))

  const finalized = currentRuns.filter((run) => FINAL_STATUSES.has(run.status))
  const responsibleMap = new Map<
    string,
    Omit<AuditResponsibleRow, 'sharePct' | 'validationPct' | 'avgCompliancePct' | 'avgCompletionPct' | 'followUpPct'> & {
      complianceTotal: number
      complianceCount: number
      completionTotal: number
      completionCount: number
    }
  >()
  const attention: AuditAttentionRow[] = []
  let runsWithDeviation = 0
  let runsWithDeviationAndIncident = 0

  for (const run of finalized) {
    const quality = auditRunQuality(run)
    const hasIncident = run.incidentOutcome === 'reported' && run.incidentIds.length > 0
    if (quality.deviations > 0) {
      runsWithDeviation += 1
      if (hasIncident) runsWithDeviationAndIncident += 1
    }
    const responsibleId = run.completedById || run.completedByName || 'sense-responsable'
    const key = `${run.department}__${responsibleId}`
    const row = responsibleMap.get(key) || {
      id: responsibleId,
      name: run.completedByName || 'Sense responsable',
      department: run.department || 'Sense departament',
      audits: 0,
      validated: 0,
      withIncident: 0,
      deviations: 0,
      followedDeviations: 0,
      complianceTotal: 0,
      complianceCount: 0,
      completionTotal: 0,
      completionCount: 0,
    }
    row.audits += 1
    if (run.status === 'validated') {
      row.validated += 1
      if (Number.isFinite(run.compliancePct)) {
        row.complianceTotal += run.compliancePct
        row.complianceCount += 1
      }
    }
    if (quality.completionPct != null) {
      row.completionTotal += quality.completionPct
      row.completionCount += 1
    }
    if (hasIncident) row.withIncident += 1
    if (quality.deviations > 0) {
      row.deviations += 1
      if (hasIncident) row.followedDeviations += 1
    }
    responsibleMap.set(key, row)

    const reasons: string[] = []
    if (quality.completionPct != null && quality.completionPct < 100) reasons.push('Emplenament incomplet')
    if (quality.deviations > 0 && !hasIncident) reasons.push('Desviació sense incidència')
    if (run.status === 'completed') reasons.push('Pendent de validar')
    const hasOpenIncident = run.incidentIds.some((id) => {
      const status = String(incidentStatusById.get(id) || '').toLowerCase()
      return status && !['resolt', 'tancat', 'resolved', 'closed'].includes(status)
    })
    if (hasOpenIncident) reasons.push('Incidència oberta')
    if (reasons.length > 0) {
      attention.push({
        id: run.id,
        eventSummary: run.eventSummary,
        eventCode: run.eventCode,
        eventDay: run.eventDay,
        department: run.department,
        responsible: run.completedByName || 'Sense responsable',
        status: run.status,
        completionPct: quality.completionPct,
        compliancePct: run.status === 'validated' ? run.compliancePct : null,
        deviations: quality.deviations,
        hasIncident,
        reasons,
      })
    }
  }

  const responsibles = Array.from(responsibleMap.values())
    .map((row): AuditResponsibleRow => ({
      id: row.id,
      name: row.name,
      department: row.department,
      audits: row.audits,
      sharePct: finalized.length ? roundAuditMetric((row.audits / finalized.length) * 100) : 0,
      validated: row.validated,
      validationPct: row.audits ? roundAuditMetric((row.validated / row.audits) * 100) : 0,
      avgCompliancePct: row.complianceCount ? roundAuditMetric(row.complianceTotal / row.complianceCount) : 0,
      avgCompletionPct: row.completionCount ? roundAuditMetric(row.completionTotal / row.completionCount) : 0,
      withIncident: row.withIncident,
      deviations: row.deviations,
      followedDeviations: row.followedDeviations,
      followUpPct: row.deviations ? roundAuditMetric((row.followedDeviations / row.deviations) * 100) : null,
    }))
    .sort((a, b) => b.audits - a.audits || a.name.localeCompare(b.name, 'ca'))

  attention.sort((a, b) => {
    const aPriority = a.reasons.includes('Desviació sense incidència') ? 0 : a.reasons.includes('Emplenament incomplet') ? 1 : 2
    const bPriority = b.reasons.includes('Desviació sense incidència') ? 0 : b.reasons.includes('Emplenament incomplet') ? 1 : 2
    return aPriority - bPriority || b.eventDay.localeCompare(a.eventDay)
  })

  const resolvedIncidentIds = new Set(
    input.incidents
      .filter((incident) => ['resolt', 'tancat', 'resolved', 'closed'].includes(incident.status.toLowerCase()))
      .map((incident) => incident.id)
  )
  const resolvedDeviationAudits = finalized.filter((run) => {
    const quality = auditRunQuality(run)
    return (
      quality.deviations > 0 &&
      run.incidentIds.length > 0 &&
      run.incidentIds.every((id) => resolvedIncidentIds.has(id))
    )
  }).length

  return {
    period: { dateFrom: input.dateFrom, dateTo: input.dateTo },
    kpis,
    previousKpis,
    trend,
    funnel: [
      { key: 'started', label: 'Iniciades', value: currentRuns.length },
      { key: 'finalized', label: 'Finalitzades', value: finalized.length },
      { key: 'validated', label: 'Validades', value: finalized.filter((run) => run.status === 'validated').length },
      { key: 'deviations', label: 'Amb desviacions', value: runsWithDeviation },
      { key: 'incidents', label: 'Desviació amb incidència', value: runsWithDeviationAndIncident },
      { key: 'resolved', label: 'Seguiment resolt', value: resolvedDeviationAudits },
    ],
    responsibles,
    attention: attention.slice(0, 100),
    filterOptions: {
      departments: sortedUnique(optionRuns.map((run) => run.department)),
      responsibles: Array.from(
        new Map(
          optionRuns
            .filter((run) => run.completedById || run.completedByName)
            .map((run) => [run.completedById || run.completedByName, run.completedByName || 'Sense responsable'])
        ).entries()
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ca')),
      templates: Array.from(
        new Map(
          optionRuns
            .filter((run) => run.templateId || run.templateName)
            .map((run) => [run.templateId || run.templateName, run.templateName || 'Sense plantilla'])
        ).entries()
      )
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ca')),
      locations: sortedUnique(optionRuns.map((run) => run.eventLocation)),
      lns: sortedUnique(optionRuns.map((run) => auditLnFromCode(run.eventCode))),
    },
  }
}
