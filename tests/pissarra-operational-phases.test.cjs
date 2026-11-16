const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  appendOperationalMontageItems,
} = require('../src/lib/pissarraOperationalPhases')

const event = {
  id: 'deal-1__2026-11-20',
  sourceEventId: 'deal-1',
  code: 'E2600527',
  LN: 'Empresa',
  eventName: 'Sopar empresa',
  startDate: '2026-11-20',
  startTime: '18:00',
  location: 'Masia Rosas',
  pax: 100,
  servei: 'Sopar',
  comercial: 'Anna',
}

const montage = {
  id: 'quadrant-muntatge',
  eventId: 'deal-1',
  code: 'E2600527',
  eventName: 'Sopar empresa',
  phaseLabel: 'Muntatge',
  phaseDate: '2026-11-16',
  startTime: '15:00',
  location: 'Masia Rosas',
  pax: 100,
  servei: 'Sopar',
  comercial: 'Anna',
  ln: 'Empresa',
  responsableName: 'Digno Belliard',
}

test('production board paints montage on its operational day, not the event day', () => {
  const items = appendOperationalMontageItems(
    [event],
    [montage],
    '2026-11-16',
    '2026-11-22'
  )

  assert.equal(items.length, 2)
  assert.equal(items[0].startDate, '2026-11-20')
  assert.equal(items[0].phaseLabel, undefined)
  assert.equal(items[1].startDate, '2026-11-16')
  assert.equal(items[1].phaseLabel, 'Muntatge')
  assert.equal(items[1].startTime, '15:00')
})

test('production board deduplicates montage documents created by reopen/save cycles', () => {
  const items = appendOperationalMontageItems(
    [],
    [
      montage,
      { ...montage, id: 'quadrant-muntatge-reopened' },
      { ...montage, id: 'quadrant-muntatge-reopened-2', eventId: 'deal-1__muntatge__2026-11-16' },
    ],
    '2026-11-16',
    '2026-11-16'
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].startDate, '2026-11-16')
})

test('production board ignores non-montage phases and phases outside the selected range', () => {
  const items = appendOperationalMontageItems(
    [event],
    [
      { ...montage, phaseLabel: 'Event' },
      { ...montage, id: 'outside', phaseDate: '2026-11-15' },
    ],
    '2026-11-16',
    '2026-11-22'
  )

  assert.deepEqual(items, [event])
})
