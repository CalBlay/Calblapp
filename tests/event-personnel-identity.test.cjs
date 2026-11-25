const test = require('node:test')
const assert = require('node:assert/strict')

const {
  closingPersonnelIdentityKey,
  eventPersonnelIdentityKey,
  labelEttPersonnel,
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

test('labels every ETT slot with its department sequence and provider', () => {
  const rows = labelEttPersonnel([
    { id: 's-1', name: 'ETT', department: 'Serveis', externalType: 'ett', ettProviderName: 'Randstad' },
    { id: 's-2', name: 'ETT', department: 'Serveis', externalType: 'ett', ettProviderName: 'Randstad' },
    { id: 'l-1', name: 'ETT', department: 'Logística', externalType: 'ett', ettProviderName: 'Eurofirms' },
    { id: 'w-1', name: 'Anna', department: 'Serveis' },
  ])

  assert.deepEqual(rows.map((row) => row.displayName || row.name), [
    'ETT 1 · Randstad',
    'ETT 2 · Randstad',
    'ETT 1 · Eurofirms',
    'Anna',
  ])
})
