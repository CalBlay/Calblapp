const assert = require('node:assert/strict')
const { test } = require('node:test')

const { mergeQuadrantPeople } = require('../src/lib/quadrantPeopleMerge')

const ett = (id) => ({
  id,
  name: 'ETT',
  isExternal: true,
  externalType: 'ett',
  groupId: 'serveis-event-ett-1',
  meetingPoint: 'CATEB',
  startDate: '2026-11-12',
  startTime: '18:00',
  endTime: '23:00',
})

test('keeps every ETT place even when name and meeting point are identical', () => {
  const merged = mergeQuadrantPeople([[ett('ett-1'), ett('ett-2'), ett('ett-3')]])

  assert.equal(merged.length, 3)
  assert.deepEqual(merged.map((person) => person.id), ['ett-1', 'ett-2', 'ett-3'])
})

test('deduplicates the same ETT ids copied across sibling service documents', () => {
  const workers = [ett('ett-1'), ett('ett-2'), ett('ett-3')]
  const merged = mergeQuadrantPeople([workers, workers.map((worker) => ({ ...worker }))])

  assert.equal(merged.length, 3)
})

test('keeps legacy ETT multiplicity without ids using occurrence order', () => {
  const legacy = { ...ett(''), id: '' }
  const merged = mergeQuadrantPeople([
    [legacy, { ...legacy }, { ...legacy }],
    [{ ...legacy }, { ...legacy }, { ...legacy }],
  ])

  assert.equal(merged.length, 3)
})

test('still deduplicates internal workers by name and meeting point', () => {
  const merged = mergeQuadrantPeople([
    [{ id: 'a', name: 'Màrling Vásquez', meetingPoint: 'CATEB' }],
    [{ id: 'b', name: 'Marling Vasquez', meetingPoint: 'CATEB' }],
  ])

  assert.equal(merged.length, 1)
})
