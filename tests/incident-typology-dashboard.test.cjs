const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeFamilyPrefix,
  mergeFamilyLabels,
  familyLabelForCategoryId,
  isIncidentCategoryGroup2xx,
  DEFAULT_INCIDENT_FAMILY_LABELS,
} = require('../src/lib/incidentTypology')

const {
  buildIncidentDashboardStats,
  buildDaySeriesForChart,
} = require('../src/lib/incidentDashboardStats')

test('normalizeFamilyPrefix keeps first digit and rejects non-numeric ids', () => {
  assert.equal(normalizeFamilyPrefix('201'), '2')
  assert.equal(normalizeFamilyPrefix(' 4xx '), '4')
  assert.equal(normalizeFamilyPrefix(''), null)
  assert.equal(normalizeFamilyPrefix('Maquinaria'), null)
})

test('isIncidentCategoryGroup2xx gates attachment requirement for Maquinària', () => {
  assert.equal(isIncidentCategoryGroup2xx('201'), true)
  assert.equal(isIncidentCategoryGroup2xx('299-extra'), true)
  assert.equal(isIncidentCategoryGroup2xx('101'), false)
  assert.equal(isIncidentCategoryGroup2xx(''), false)
  assert.equal(isIncidentCategoryGroup2xx('abc'), false)
})

test('mergeFamilyLabels overlays Firestore labels onto defaults by digit prefix', () => {
  const merged = mergeFamilyLabels({
    '2': '  Maquinària custom  ',
    '9': 'Altres',
    junk: 'ignore',
  })
  assert.equal(merged['2'], 'Maquinària custom')
  assert.equal(merged['9'], 'Altres')
  assert.equal(merged.junk, undefined)

  // Keys normalize to first digit, so "2xx" writes the same slot as "2".
  assert.equal(mergeFamilyLabels({ '2xx': 'also-2' })['2'], 'also-2')
  assert.equal(mergeFamilyLabels(null)['2'], DEFAULT_INCIDENT_FAMILY_LABELS['2'])
  assert.equal(mergeFamilyLabels(undefined)['1'], DEFAULT_INCIDENT_FAMILY_LABELS['1'])
})
test('familyLabelForCategoryId falls back to Grup NXX when prefix missing', () => {
  assert.equal(familyLabelForCategoryId('201', { '2': 'Maquinària' }), 'Maquinària')
  assert.equal(familyLabelForCategoryId('701', {}), 'Grup 7XX')
  assert.equal(familyLabelForCategoryId('', {}), '—')
})

test('buildIncidentDashboardStats aggregates status, priority, dept/cat charts, and dayMap', () => {
  const stats = buildIncidentDashboardStats([
    {
      status: 'Obert',
      department: 'Cuina',
      category: { label: 'Fuita' },
      importance: 'urgent',
      eventDate: '2026-08-05',
    },
    {
      status: 'en_curs',
      department: 'Cuina',
      category: { label: 'Fuita' },
      importance: 'alta',
      createdAt: '2026-08-06T08:00:00.000Z',
    },
    {
      status: 'Resolt',
      department: '',
      category: { label: '' },
      importance: 'baixa',
      eventDate: '2026-08-05',
    },
    {
      status: 'mystery',
      department: 'Serveis',
      category: { label: 'Altres' },
      importance: 'mitjana',
      eventDate: null,
      createdAt: null,
    },
  ])

  assert.equal(stats.total, 4)
  assert.equal(stats.byStatus.obert, 2) // Obert + mystery normalize to obert
  assert.equal(stats.byStatus.en_curs, 1)
  assert.equal(stats.byStatus.resolt, 1)
  assert.equal(stats.highPriority, 2)
  assert.deepEqual(
    stats.deptChart.map((entry) => entry.name),
    ['Cuina', 'Sense departament', 'Serveis']
  )
  assert.equal(stats.dayMap.get('2026-08-05'), 2)
  assert.equal(stats.dayMap.get('2026-08-06'), 1)
  assert.equal(
    stats.statusChart.some((entry) => entry.name === 'Obert' && entry.value === 2),
    true
  )
})

test('buildIncidentDashboardStats rolls categories beyond top 10 into Altres categories', () => {
  const incidents = Array.from({ length: 12 }, (_, i) => ({
    status: 'obert',
    department: 'Prod',
    category: { label: `Cat-${i}` },
    importance: 'baixa',
    eventDate: '2026-08-01',
  }))
  // Make Cat-0 the largest so it stays in top 10.
  incidents.push({
    status: 'obert',
    department: 'Prod',
    category: { label: 'Cat-0' },
    importance: 'baixa',
    eventDate: '2026-08-01',
  })

  const stats = buildIncidentDashboardStats(incidents)
  const other = stats.catChart.find((entry) => entry.name === 'Altres categories')
  assert.ok(other)
  assert.equal(other.value, 2) // Cat-10 and Cat-11
  assert.equal(stats.catChart.length, 11) // top 10 + Altres
})

test('buildDaySeriesForChart fills missing days and swaps inverted ranges', () => {
  const dayMap = new Map([
    ['2026-08-05', 2],
    ['2026-08-07', 1],
  ])
  const series = buildDaySeriesForChart(dayMap, '2026-08-07', '2026-08-05')
  assert.equal(series.length, 3)
  assert.deepEqual(
    series.map((row) => row.value),
    [2, 0, 1]
  )
  assert.deepEqual(buildDaySeriesForChart(dayMap, 'bad', '2026-08-05'), [])
})
