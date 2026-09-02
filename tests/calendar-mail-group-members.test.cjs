const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeMailGroupMembers,
  serializeMailGroup,
} = require('../src/lib/calendar/calendarMailGroups')

test('normalizeMailGroupMembers drops invalid rows and dedupes emails case-insensitively', () => {
  assert.deepEqual(normalizeMailGroupMembers(null), [])
  assert.deepEqual(normalizeMailGroupMembers('not-an-array'), [])
  assert.deepEqual(
    normalizeMailGroupMembers([
      { name: 'Ada', email: 'ADA@example.test' },
      { name: 'Ada duplicate', email: 'ada@example.test' },
      { name: 'No at', email: 'not-an-email' },
      { email: '  bob@example.test  ' },
      null,
      { name: 'Empty', email: '' },
      { name: 'Only spaces', email: '   ' },
    ]),
    [
      { name: 'Ada', email: 'ada@example.test' },
      { name: 'bob@example.test', email: 'bob@example.test' },
    ]
  )
})

test('normalizeMailGroupMembers falls back to the email when name is blank', () => {
  assert.deepEqual(normalizeMailGroupMembers([{ name: '   ', email: 'cara@example.test' }]), [
    { name: 'cara@example.test', email: 'cara@example.test' },
  ])
})

test('serializeMailGroup trims fields and omits empty optional strings', () => {
  const group = serializeMailGroup('g-1', {
    name: '  Comercials  ',
    description: '  ',
    ln: 'Restaurants',
    members: [{ name: 'Ada', email: 'ada@example.test' }],
    createdByUserId: '  u-1 ',
    createdByName: '',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: ' 2026-08-02T00:00:00.000Z ',
  })
  assert.equal(group.id, 'g-1')
  assert.equal(group.name, 'Comercials')
  assert.equal(group.description, undefined)
  assert.equal(group.ln, 'Restaurants')
  assert.equal(group.createdByUserId, 'u-1')
  assert.equal(group.createdByName, undefined)
  assert.equal(group.createdAt, '2026-08-01T00:00:00.000Z')
  assert.equal(group.updatedAt, '2026-08-02T00:00:00.000Z')
  assert.deepEqual(group.members, [{ name: 'Ada', email: 'ada@example.test' }])
})
