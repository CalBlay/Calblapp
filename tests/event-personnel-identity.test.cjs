const test = require('node:test')
const assert = require('node:assert/strict')

const {
  closingPersonnelIdentityKey,
  eventPersonnelIdentityKey,
  mergeResponsiblePersonnelSchedules,
} = require('../src/lib/eventPersonnelIdentity')

test('keeps multiple ETT workers separate when they have different ids', () => {
  const first = eventPersonnelIdentityKey({
    id: 'logistica-ett-mati-1',
    name: 'ETT',
    department: 'Logística',
  })
  const second = eventPersonnelIdentityKey({
    id: 'logistica-ett-mati-2',
    name: 'ETT',
    department: 'Logistica',
  })

  assert.notEqual(first, second)
})

test('still deduplicates legacy workers without ids by department and name', () => {
  const first = eventPersonnelIdentityKey({ name: 'Joan', department: 'Logística' })
  const second = eventPersonnelIdentityKey({ name: ' joan ', department: 'logistica' })

  assert.equal(first, second)
})

test('closing treats the same responsible as one person even when shift ids differ', () => {
  const first = closingPersonnelIdentityKey({
    id: 'shift-1-responsible',
    name: 'Luis Soguero',
    department: 'Serveis',
    role: 'responsable',
  })
  const second = closingPersonnelIdentityKey({
    id: 'shift-2-responsible',
    name: 'Luis Soguero',
    department: 'serveis',
    role: 'responsable',
  })

  assert.equal(first, second)
})

test('merged responsible keeps one global planned interval', () => {
  const merged = mergeResponsiblePersonnelSchedules(
    {
      id: 'shift-1-responsible',
      name: 'Luis Soguero',
      department: 'serveis',
      role: 'responsable',
      time: '09:30',
      plannedStartTime: '09:30',
      endTime: '17:30',
      sourceUpdatedAt: 1,
    },
    {
      id: 'shift-2-responsible',
      name: 'Luis Soguero',
      department: 'serveis',
      role: 'responsable',
      time: '12:30',
      plannedStartTime: '12:30',
      endTime: '17:30',
      sourceUpdatedAt: 2,
    }
  )

  assert.equal(merged.time, '09:30')
  assert.equal(merged.plannedStartTime, '09:30')
  assert.equal(merged.endTime, '17:30')
})
