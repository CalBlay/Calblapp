const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildPendingExpandKey,
  isPendingExpandKey,
  parsePendingExpandKey,
  findPhaseByPendingExpandKey,
  buildPendingQuadrantDocId,
  buildPendingQuadrantDraft,
} = require('../src/lib/buildPendingQuadrantDraft')

function phase(overrides = {}) {
  return {
    id: 'E123__event__2026-08-01__event',
    eventId: 'E123',
    summary: 'Casament E1234567 Can Blay',
    start: '2026-08-01T10:00:00.000Z',
    end: '2026-08-01T18:00:00.000Z',
    phaseKey: 'event',
    phaseType: 'event',
    phaseDate: '2026-08-01',
    phaseLabel: 'Event',
    location: 'Sala gran',
    displayStartTime: '10:00',
    displayEndTime: '18:00',
    responsable: 'Anna Puig',
    ...overrides,
  }
}

test('buildPendingExpandKey uses canonical event id + phase + date', () => {
  assert.equal(
    buildPendingExpandKey(phase()),
    'pending:E123:event:2026-08-01'
  )
  assert.equal(
    buildPendingExpandKey(
      phase({
        id: 'E123__muntatge__2026-07-31__group',
        eventId: 'E123',
        phaseKey: 'muntatge',
        phaseType: 'muntatge',
        phaseDate: '2026-07-31',
      })
    ),
    'pending:E123:muntatge:2026-07-31'
  )
})

test('parsePendingExpandKey rejects non-pending keys and incomplete payloads', () => {
  assert.equal(isPendingExpandKey('E123'), false)
  assert.equal(parsePendingExpandKey('E123'), null)
  assert.equal(parsePendingExpandKey('pending:E123:event'), null)
  assert.equal(parsePendingExpandKey('pending::event:2026-08-01'), null)
})

test('parsePendingExpandKey keeps event ids that contain colons', () => {
  assert.deepEqual(parsePendingExpandKey('pending:deal:abc:muntatge:2026-08-02'), {
    eventId: 'deal:abc',
    phaseKey: 'muntatge',
    phaseDate: '2026-08-02',
  })
})

test('findPhaseByPendingExpandKey matches by canonical id, phase, and day', () => {
  const events = [
    phase({ phaseKey: 'muntatge', phaseType: 'muntatge', phaseDate: '2026-07-31' }),
    phase(),
    phase({
      id: 'E999__event__2026-08-01__event',
      eventId: 'E999',
      phaseDate: '2026-08-01',
    }),
  ]

  const found = findPhaseByPendingExpandKey('pending:E123:event:2026-08-01', events)
  assert.equal(found?.eventId, 'E123')
  assert.equal(found?.phaseKey, 'event')
  assert.equal(
    findPhaseByPendingExpandKey('pending:E123:desmuntatge:2026-08-01', events),
    undefined
  )
})

test('buildPendingQuadrantDocId builds compound phase/day ids and sanitizes group', () => {
  assert.equal(
    buildPendingQuadrantDocId(phase(), 'group-1'),
    'E123__event__2026-08-01__group-1'
  )
  assert.equal(
    buildPendingQuadrantDocId(
      phase({ phaseKey: 'Muntatge', phaseDate: '' }),
      'g@roup!'
    ),
    'E123__muntatge__nodate__group'
  )
})

test('buildPendingQuadrantDraft creates serveis event groups and extracts code', () => {
  const draft = buildPendingQuadrantDraft(phase({ code: '' }), 'Serveis')

  assert.equal(draft.id, 'E123__event__2026-08-01__group-1')
  assert.equal(draft.code, 'E1234567')
  assert.equal(draft.department, 'serveis')
  assert.equal(draft.status, 'draft')
  assert.equal(draft.phaseType, 'event')
  assert.equal(draft.phaseDate, '2026-08-01')
  assert.equal(draft.responsableName, 'Anna Puig')
  assert.equal(draft.numDrivers, 0)
  assert.ok(Array.isArray(draft.groups))
  assert.equal(draft.groups.length, 1)
  assert.equal(draft.groups[0].responsibleName, 'Anna Puig')
  assert.equal(draft.groups[0].workers, 1)
})

test('buildPendingQuadrantDraft keeps muntatge serveis drafts ungrouped', () => {
  const draft = buildPendingQuadrantDraft(
    phase({
      phaseKey: 'muntatge',
      phaseType: 'muntatge',
      phaseLabel: 'Muntatge',
      phaseDate: '2026-07-31',
    }),
    'serveis'
  )

  assert.equal(draft.id, 'E123__muntatge__2026-07-31__group')
  assert.equal(draft.groups, undefined)
  assert.equal(draft.phaseLabel, 'Muntatge')
})

test('buildPendingQuadrantDraft sets cuina groups and logistica driver defaults', () => {
  const cuina = buildPendingQuadrantDraft(phase(), 'cuina')
  assert.equal(cuina.id, 'E123__event__2026-08-01__group-1')
  assert.ok(Array.isArray(cuina.groups))
  assert.equal(cuina.numDrivers, 0)

  const logistica = buildPendingQuadrantDraft(phase(), 'logistica')
  assert.equal(logistica.id, 'E123__event__2026-08-01__group')
  assert.equal(logistica.groups, undefined)
  assert.equal(logistica.numDrivers, 1)
})
