const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildProjectListFilterMeta,
  filterProjectsByQuery,
  filterVisibleProjects,
  isProjectClosed,
  paginateProjects,
  parseProjectListQuery,
  toProjectListRecord,
} = require('../src/lib/projects/listQuery')

const capServeis = { id: 'u-cap', name: 'Marta Cap', role: 'cap', department: 'serveis' }
const admin = { id: 'u-admin', name: 'Admin', role: 'admin', department: 'direccio' }

const ownedProject = {
  id: 'p-owned',
  name: 'Event Café 2026',
  owner: 'Marta Cap',
  ownerUserId: 'u-cap',
  departments: ['Serveis'],
  startDate: '2026-08-01',
  launchDate: '2026-08-20',
  blocks: [{ status: 'pending', tasks: [{ status: 'pending' }] }],
}

const closedProject = {
  id: 'p-closed',
  name: 'Old launch',
  owner: 'Other',
  departments: ['Cuina'],
  launchDate: '2026-01-10',
  blocks: [
    { status: 'in_progress', tasks: [{ status: 'fet' }, { status: 'done' }] },
    { status: 'pending', tasks: [{ status: 'tancat' }] },
  ],
}

const otherOpenProject = {
  id: 'p-other',
  name: 'Other open',
  owner: 'Other',
  departments: ['Logistica'],
  startDate: '2026-08-15',
  blocks: [{ status: 'pending', tasks: [] }],
}

test('isProjectClosed treats empty blocks as open and Catalan done statuses as closed', () => {
  assert.equal(isProjectClosed({ id: 'empty', blocks: [] }), false)
  assert.equal(isProjectClosed({ id: 'no-blocks' }), false)
  assert.equal(isProjectClosed(closedProject), true)
  assert.equal(
    isProjectClosed({
      id: 'blocked',
      blocks: [{ tasks: [{ status: 'blocked' }, { status: 'done' }] }],
    }),
    false
  )
  assert.equal(
    isProjectClosed({
      id: 'legacy-status',
      blocks: [{ status: 'acabada', tasks: [] }],
    }),
    true
  )
})

test('filterVisibleProjects only expands to all projects for admin/direccio + scope=all', () => {
  const all = [ownedProject, otherOpenProject]

  assert.deepEqual(
    filterVisibleProjects(all, capServeis, 'all').map((p) => p.id),
    ['p-owned']
  )
  assert.deepEqual(
    filterVisibleProjects(all, admin, 'mine').map((p) => p.id),
    []
  )
  assert.deepEqual(
    filterVisibleProjects(all, admin, 'all').map((p) => p.id),
    ['p-owned', 'p-other']
  )
})

test('filterProjectsByQuery defaults to open lifecycle and matches accent-folded search', () => {
  const rows = [ownedProject, closedProject, otherOpenProject]

  const openOnly = filterProjectsByQuery(rows, {})
  assert.deepEqual(
    openOnly.map((p) => p.id).sort(),
    ['p-other', 'p-owned']
  )

  const closedOnly = filterProjectsByQuery(rows, { lifecycle: 'closed' })
  assert.deepEqual(
    closedOnly.map((p) => p.id),
    ['p-closed']
  )

  const cafeSearch = filterProjectsByQuery(rows, { q: 'cafe' })
  assert.deepEqual(
    cafeSearch.map((p) => p.id),
    ['p-owned']
  )

  const deptFilter = filterProjectsByQuery(rows, { department: 'SERVEIS' })
  assert.deepEqual(
    deptFilter.map((p) => p.id),
    ['p-owned']
  )

  const ownerFilter = filterProjectsByQuery(rows, { owner: 'marta cap' })
  assert.deepEqual(
    ownerFilter.map((p) => p.id),
    ['p-owned']
  )
})

test('filterProjectsByQuery uses launchDate then startDate for the date window', () => {
  const rows = [ownedProject, otherOpenProject]

  assert.deepEqual(
    filterProjectsByQuery(rows, { startDate: '2026-08-20', endDate: '2026-08-20' }).map((p) => p.id),
    ['p-owned']
  )
  assert.deepEqual(
    filterProjectsByQuery(rows, { startDate: '2026-08-14', endDate: '2026-08-16' }).map((p) => p.id),
    ['p-other']
  )
  assert.deepEqual(
    filterProjectsByQuery([{ id: 'no-dates', name: 'No dates', blocks: [] }], { startDate: '2026-08-01' }),
    []
  )
})

test('parseProjectListQuery defaults scope=mine and lifecycle=open', () => {
  const parsed = parseProjectListQuery(new URLSearchParams('page=foo&limit=bar&scope=mine'))
  assert.equal(parsed.page, 0)
  assert.equal(parsed.limit, 12)
  assert.equal(parsed.scope, 'mine')
  assert.equal(parsed.lifecycle, 'open')

  const allClosed = parseProjectListQuery(new URLSearchParams('scope=all&lifecycle=closed&limit=40&page=2'))
  assert.equal(allClosed.scope, 'all')
  assert.equal(allClosed.lifecycle, 'closed')
  assert.equal(allClosed.limit, 40)
  assert.equal(allClosed.page, 2)
})

test('paginateProjects clamps page/limit and slices deterministically', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}` }))
  const first = paginateProjects(items, 0, 3)
  assert.equal(first.limit, 3)
  assert.deepEqual(
    first.projects.map((p) => p.id),
    ['p0', 'p1', 'p2']
  )

  const clamped = paginateProjects(items, -2, 999)
  assert.equal(clamped.page, 0)
  assert.equal(clamped.limit, 50)
  assert.equal(clamped.total, 8)
})

test('toProjectListRecord and filter meta keep trimmed departments/owners', () => {
  const record = toProjectListRecord('p1', {
    name: '  Launch  ',
    owner: '  Anna  ',
    departments: [' Cuina ', '', 'Serveis'],
    blocks: [{ department: 'Cuina', tasks: [{ owner: 'Anna', status: 'pending' }] }],
  })
  assert.equal(record.name, 'Launch')
  assert.equal(record.owner, 'Anna')
  assert.deepEqual(record.departments, ['Cuina', 'Serveis'])

  const meta = buildProjectListFilterMeta([record, { id: 'p2', owner: 'Anna', departments: ['cuina'] }])
  assert.deepEqual(
    meta.departments.map((d) => d.value).sort(),
    ['cuina', 'serveis']
  )
  assert.deepEqual(meta.owners, ['Anna'])
})
