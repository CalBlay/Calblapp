const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  intervalsOverlap,
  hasMinRestByName,
} = require('../src/utils/personnelRest')

after(() => {
  Module._load = originalLoad
})

const d = (iso) => new Date(iso)

test('intervalsOverlap is half-open on touching endpoints', () => {
  assert.equal(
    intervalsOverlap(d('2026-08-11T08:00:00'), d('2026-08-11T12:00:00'), d('2026-08-11T12:00:00'), d('2026-08-11T16:00:00')),
    false
  )
  assert.equal(
    intervalsOverlap(d('2026-08-11T08:00:00'), d('2026-08-11T12:01:00'), d('2026-08-11T12:00:00'), d('2026-08-11T16:00:00')),
    true
  )
})

test('hasMinRestByName rejects overlap and short rest, matching accent-folded names', () => {
  const busy = [
    {
      startDate: '2026-08-11',
      endDate: '2026-08-11',
      startTime: '08:00',
      endTime: '16:00',
      treballadors: [{ name: 'Josép' }],
    },
  ]

  assert.equal(
    hasMinRestByName('Josep', busy, d('2026-08-11T15:00:00'), d('2026-08-11T18:00:00'), 8),
    false
  )
  assert.equal(
    hasMinRestByName('Josep', busy, d('2026-08-11T18:00:00'), d('2026-08-11T22:00:00'), 8),
    false
  )
  assert.equal(
    hasMinRestByName('Josep', busy, d('2026-08-12T08:00:00'), d('2026-08-12T16:00:00'), 8),
    true
  )
  assert.equal(
    hasMinRestByName('Anna', busy, d('2026-08-11T09:00:00'), d('2026-08-11T11:00:00'), 8),
    true
  )
})

test('hasMinRestByName wraps overnight quadrants and defaults invalid rest to 8h', () => {
  const overnight = [
    {
      startDate: '2026-08-11',
      endDate: '2026-08-11',
      startTime: '22:00',
      endTime: '06:00',
      groups: [{ responsibleName: 'Marta' }],
    },
  ]

  assert.equal(
    hasMinRestByName('Marta', overnight, d('2026-08-12T05:00:00'), d('2026-08-12T09:00:00'), 0),
    false
  )
  assert.equal(
    hasMinRestByName('Marta', overnight, d('2026-08-12T14:00:00'), d('2026-08-12T18:00:00'), 8),
    true
  )
  assert.equal(
    hasMinRestByName('Marta', overnight, d('2026-08-12T10:00:00'), d('2026-08-12T14:00:00'), Number.NaN),
    false
  )
})
