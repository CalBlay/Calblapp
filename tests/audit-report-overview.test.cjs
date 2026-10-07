const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  auditRunQuality,
  buildAuditOverview,
} = require('../src/lib/informes/auditOverview')

const dayMs = (day) => new Date(`${day}T12:00:00`).getTime()

function run(overrides = {}) {
  return {
    id: 'run-1',
    eventId: 'event-1',
    eventSummary: 'Casament de prova',
    eventCode: 'C-100',
    eventLocation: 'Masia',
    eventDay: '2026-10-05',
    department: 'serveis',
    templateId: 'template-1',
    templateName: 'Servei',
    status: 'validated',
    completedAt: dayMs('2026-10-05'),
    savedAt: 0,
    updatedAt: dayMs('2026-10-05'),
    completedById: 'user-1',
    completedByName: 'Anna',
    completedByDepartment: 'serveis',
    reviewedByName: 'Cap de serveis',
    compliancePct: 75,
    incidentOutcome: 'none',
    incidentIds: [],
    templateSnapshot: [
      {
        id: 'block-1',
        title: 'Muntatge',
        items: [
          { id: 'check-1', type: 'checklist' },
          { id: 'rating-1', type: 'rating' },
          { id: 'photo-1', type: 'photo' },
        ],
      },
    ],
    auditAnswers: [
      { itemId: 'check-1', type: 'checklist', value: false },
      { itemId: 'rating-1', type: 'rating', value: 6 },
    ],
    ...overrides,
  }
}

test('auditRunQuality separates completion from deviations', () => {
  const quality = auditRunQuality(run())
  assert.equal(quality.completionPct, 66.7)
  assert.equal(quality.deviations, 2)
})

test('buildAuditOverview aggregates KPIs, owners and attention cases', () => {
  const rows = [
    run(),
    run({
      id: 'run-2',
      completedById: 'user-2',
      completedByName: 'Bernat',
      status: 'completed',
      compliancePct: 0,
      incidentOutcome: 'reported',
      incidentIds: ['incident-1'],
      auditAnswers: [
        { itemId: 'check-1', type: 'checklist', value: true },
        { itemId: 'rating-1', type: 'rating', value: 9 },
        { itemId: 'photo-1', type: 'photo', photos: [{ url: 'https://example.com/photo.jpg' }] },
      ],
    }),
    run({
      id: 'run-old',
      completedAt: dayMs('2026-09-05'),
      updatedAt: dayMs('2026-09-05'),
    }),
  ]

  const result = buildAuditOverview({
    runs: rows,
    incidents: [{ id: 'incident-1', status: 'obert' }],
    dateFrom: '2026-10-01',
    dateTo: '2026-10-07',
    previousDateFrom: '2026-09-01',
    previousDateTo: '2026-09-07',
  })

  assert.equal(result.kpis.finalized, 2)
  assert.equal(result.kpis.validated, 1)
  assert.equal(result.kpis.validationPct, 50)
  assert.equal(result.kpis.withIncident, 1)
  assert.equal(result.kpis.deviationsWithoutIncident, 1)
  assert.equal(result.previousKpis.finalized, 1)
  assert.equal(result.responsibles.length, 2)
  assert.equal(result.attention.some((row) => row.id === 'run-1' && row.reasons.includes('Desviació sense incidència')), true)
  assert.equal(result.attention.some((row) => row.id === 'run-2' && row.reasons.includes('Incidència oberta')), true)
})

test('buildAuditOverview applies department and responsible filters consistently', () => {
  const result = buildAuditOverview({
    runs: [
      run(),
      run({ id: 'run-2', department: 'cuina', completedById: 'user-2', completedByName: 'Berta' }),
    ],
    incidents: [],
    dateFrom: '2026-10-01',
    dateTo: '2026-10-07',
    previousDateFrom: '2026-09-24',
    previousDateTo: '2026-09-30',
    filters: { department: 'cuina', responsible: 'user-2' },
  })

  assert.equal(result.kpis.finalized, 1)
  assert.equal(result.responsibles[0].name, 'Berta')
  assert.deepEqual(result.filterOptions.departments, ['cuina', 'serveis'])
})
