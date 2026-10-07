const test = require('node:test')
const assert = require('node:assert/strict')

const {
  eventPersonnelIdentityKey,
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
