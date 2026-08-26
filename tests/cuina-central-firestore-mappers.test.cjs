const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  mapArticle,
  mapLog,
  mapPlan,
  mapShift,
  stripCustomFields,
} = require('../src/lib/cuina-central/firestoreMappers')

test('mapArticle defaults unit/active and reads Firestore Timestamp toMillis', () => {
  const article = mapArticle('a1', {
    code: '  BASE  ',
    name: 'Tomàquet',
    createdAt: { toMillis: () => 1_700_000_000_000 },
    updatedAt: 1_700_000_000_111,
  })

  assert.equal(article.id, 'a1')
  assert.equal(article.code, 'BASE')
  assert.equal(article.unit, 'kg')
  assert.equal(article.active, true)
  assert.equal(article.line, 'bases')
  assert.equal(article.packagingQty, null)
  assert.equal(article.createdAt, 1_700_000_000_000)
  assert.equal(article.updatedAt, 1_700_000_000_111)
})

test('mapArticle keeps explicit inactive and packaging qty, nulls invalid timestamps', () => {
  const article = mapArticle('a2', {
    unit: 'UN',
    active: false,
    packagingQty: '4',
    createdAt: 'not-a-ts',
    updatedAt: Number.NaN,
  })
  assert.equal(article.unit, 'UN')
  assert.equal(article.active, false)
  assert.equal(article.packagingQty, 4)
  assert.equal(article.createdAt, null)
  assert.equal(article.updatedAt, null)
})

test('mapShift uses stored duration when set and overnight wrap when duration is 0', () => {
  const stored = mapShift('s1', {
    startTime: '22:00',
    endTime: '06:00',
    durationMinutes: 999,
  })
  assert.equal(stored.durationMinutes, 999)

  const overnight = mapShift('s2', {
    code: 'NIT',
    name: 'Nit',
    startTime: '22:00',
    endTime: '06:00',
    durationMinutes: 0,
  })
  assert.equal(overnight.durationMinutes, 480)
  assert.equal(overnight.active, true)
})

test('mapPlan treats unknown status as draft and coerces nested collections', () => {
  const draft = mapPlan('p1', {
    weekStart: '2026-08-24',
    status: 'published',
    operatorCountByShift: 'nope',
    needs: 'nope',
    slots: null,
    warnings: ['cap'],
  })
  assert.equal(draft.status, 'draft')
  assert.deepEqual(draft.operatorCountByShift, {})
  assert.deepEqual(draft.needs, [])
  assert.deepEqual(draft.slots, [])
  assert.deepEqual(draft.warnings, ['cap'])

  const confirmed = mapPlan('p2', {
    status: 'confirmed',
    operatorCountByShift: { 's-1': 2 },
    needs: [{ articleId: 'a' }],
  })
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.needs.length, 1)
  assert.deepEqual(confirmed.operatorCountByShift, { 's-1': 2 })
})

test('mapLog parses quantities and leaves empty duration at 0', () => {
  const log = mapLog('l1', {
    quantityProduced: '12.5',
    quantityRejected: 'bad',
    durationMinutes: '',
    startedAt: '2026-08-26T08:00:00.000Z',
    endedAt: '2026-08-26T09:00:00.000Z',
  })
  assert.equal(log.quantityProduced, 12.5)
  assert.equal(log.quantityRejected, 0)
  assert.equal(log.durationMinutes, 0)
})

test('stripCustomFields drops blank keys', () => {
  assert.deepEqual(stripCustomFields({ '  ': 1, ok: 'yes', '  k  ': false }), {
    ok: 'yes',
    k: false,
  })
})
