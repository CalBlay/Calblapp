const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  baseCanAttachEventVisitVideo,
} = require('../src/lib/eventVisitVideoPermissions')
const {
  normalizeVisitVideoUserId,
  isVisitVideoFieldKey,
  visitVideoFieldKey,
  nextVisitVideoField,
  listVisitVideoFieldKeys,
  MAX_EVENT_VISIT_VIDEOS,
} = require('../src/lib/eventVisitVideo')

test('baseCanAttachEventVisitVideo allows admin, direccio, and comercial role', () => {
  assert.equal(baseCanAttachEventVisitVideo({ role: 'admin' }), true)
  assert.equal(baseCanAttachEventVisitVideo({ role: 'Direcció' }), true)
  assert.equal(baseCanAttachEventVisitVideo({ role: 'comercial' }), true)
  assert.equal(baseCanAttachEventVisitVideo({ role: 'Comercial' }), true)
})

test('baseCanAttachEventVisitVideo allows cap of commercial departments only', () => {
  for (const department of [
    'comercial',
    'Empresa',
    'casaments',
    'foodlovers',
    'Food Lover',
    'agenda',
  ]) {
    assert.equal(
      baseCanAttachEventVisitVideo({ role: 'cap', department }),
      true,
      department
    )
  }
  assert.equal(
    baseCanAttachEventVisitVideo({ role: 'cap departament', department: 'empresa' }),
    true
  )
  assert.equal(
    baseCanAttachEventVisitVideo({ role: 'cap', department: 'serveis' }),
    false
  )
  assert.equal(
    baseCanAttachEventVisitVideo({ role: 'treballador', department: 'comercial' }),
    false
  )
  assert.equal(baseCanAttachEventVisitVideo({ role: 'usuari' }), false)
})

test('normalizeVisitVideoUserId keeps alnum underscore dash and strips the rest', () => {
  assert.equal(normalizeVisitVideoUserId(' user-1_A '), 'user-1_A')
  assert.equal(normalizeVisitVideoUserId('user@calblay.com'), 'usercalblaycom')
  assert.equal(normalizeVisitVideoUserId('../etc'), 'etc')
  assert.equal(normalizeVisitVideoUserId(''), '')
})

test('visit video field keys allocate 1..3 and reject extras', () => {
  assert.equal(MAX_EVENT_VISIT_VIDEOS, 3)
  assert.equal(visitVideoFieldKey(1), 'visitVideo1')
  assert.equal(isVisitVideoFieldKey('visitVideo2'), true)
  assert.equal(isVisitVideoFieldKey('visitVideo'), false)
  assert.equal(isVisitVideoFieldKey('video1'), false)

  assert.equal(nextVisitVideoField([]), 'visitVideo1')
  assert.equal(nextVisitVideoField(['visitVideo1']), 'visitVideo2')
  assert.equal(nextVisitVideoField(['visitVideo1', 'visitVideo3']), 'visitVideo2')
  assert.equal(nextVisitVideoField(['visitVideo1', 'visitVideo2', 'visitVideo3']), null)
})

test('listVisitVideoFieldKeys drops empty values and sorts by index', () => {
  assert.deepEqual(
    listVisitVideoFieldKeys({
      visitVideo2: ' https://drive.google.com/x ',
      visitVideo1: '',
      visitVideo3: 'https://example/v',
      other: 'nope',
    }),
    ['visitVideo2', 'visitVideo3']
  )
  assert.deepEqual(listVisitVideoFieldKeys({ visitVideo1: 1 }), [])
})
