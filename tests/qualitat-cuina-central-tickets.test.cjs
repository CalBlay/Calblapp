const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

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
  isQualitatVisibleCuinaCentralTicket,
} = require('../src/lib/server/qualitatCuinaCentralTickets')

test('isQualitatVisibleCuinaCentralTicket allows creator self-view', () => {
  assert.equal(
    isQualitatVisibleCuinaCentralTicket(
      { createdById: 'u-self', location: 'Other' },
      new Set(['other-cc']),
      'u-self'
    ),
    true
  )
})

test('isQualitatVisibleCuinaCentralTicket allows Cuina Central intake/source tickets', () => {
  assert.equal(
    isQualitatVisibleCuinaCentralTicket(
      { intakeChannel: 'manual_cuina_central', createdById: 'x' },
      new Set(),
      'viewer'
    ),
    true
  )
  assert.equal(
    isQualitatVisibleCuinaCentralTicket(
      { source: 'manual_cuina_central', createdById: 'x' },
      new Set(),
      'viewer'
    ),
    true
  )
})

test('isQualitatVisibleCuinaCentralTicket allows tickets created by Cuina Central user ids', () => {
  assert.equal(
    isQualitatVisibleCuinaCentralTicket(
      { createdById: 'cc-1', location: 'Sala' },
      new Set(['cc-1', 'cc-2']),
      'qualitat-viewer'
    ),
    true
  )
  assert.equal(
    isQualitatVisibleCuinaCentralTicket(
      { createdById: 'outsider', location: 'Sala' },
      new Set(['cc-1']),
      'qualitat-viewer'
    ),
    false
  )
  assert.equal(
    isQualitatVisibleCuinaCentralTicket(
      { createdById: '', location: 'Sala' },
      new Set(['cc-1']),
      'qualitat-viewer'
    ),
    false
  )
})
