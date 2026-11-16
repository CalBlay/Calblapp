const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  QUADRANTS_MEETING_CORE_NAMES,
  resolveQuadrantsMeetingAttendees,
} = require('../src/lib/quadrantsMeetingAttendees')

test('quadrants meeting resolves the seven fixed attendees in order', () => {
  const users = [
    { id: 'jordi-cuina', name: 'Jordi Soler', email: 'jordi.soler@example.test', department: 'Cuina' },
    { id: 'jordi', name: 'Jordi', email: 'jordi@example.test', department: 'Serveis' },
    { id: 'josep', name: 'Josep', email: 'josep@example.test', department: 'Logistica' },
    { id: 'souli', name: 'Soulaimane El Bouzidi', email: 'souli@example.test', department: 'Cuina' },
    { id: 'fred', name: 'Frederick Aubert', email: 'fred@example.test', department: 'Cuina' },
    { id: 'david', name: 'David', email: 'david@example.test', department: 'Logistica' },
    { id: 'gaston', name: 'Gaston', email: 'gaston@example.test', department: 'Serveis' },
    { id: 'jona', name: 'Jona', email: 'jona@example.test', department: 'Serveis' },
  ]

  const attendees = resolveQuadrantsMeetingAttendees(users)

  assert.equal(attendees.length, 7)
  assert.deepEqual(
    attendees.map((attendee) => attendee.name),
    ['Jona', 'Gaston', 'David', 'Frederick Aubert', 'Soulaimane El Bouzidi', 'Josep', 'Jordi']
  )
  assert.equal(attendees.at(-1).userId, 'jordi')
  assert.deepEqual(QUADRANTS_MEETING_CORE_NAMES.slice(0, 3), ['Jona', 'Gaston', 'David'])
  assert.ok(attendees.every((attendee) => attendee.receiveEmail === true))
})
