const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  hasLaunchWindowExpired,
  selectProjectRoomsToArchiveOnLaunch,
} = require('../src/lib/projects/launchWindow')
const {
  getPreLaunchDeadline,
  clampProjectDeadline,
} = require('../src/app/menu/projects/components/project-shared')

const rooms = [{ id: 'general' }, { id: 'block-a' }]
const added = [{ id: 'block-b' }]

test('hasLaunchWindowExpired treats empty or invalid dates as still open', () => {
  const now = Date.parse('2026-08-21T12:00:00')
  assert.equal(hasLaunchWindowExpired('', now), false)
  assert.equal(hasLaunchWindowExpired('   ', now), false)
  assert.equal(hasLaunchWindowExpired('not-a-date', now), false)
})

test('hasLaunchWindowExpired waits until the day after launch midnight', () => {
  const launch = '2026-08-20'
  const justBefore = new Date('2026-08-20T00:00:00').getTime() + 24 * 60 * 60 * 1000 - 1
  const atExpiry = new Date('2026-08-20T00:00:00').getTime() + 24 * 60 * 60 * 1000

  assert.equal(hasLaunchWindowExpired(launch, justBefore), false)
  assert.equal(hasLaunchWindowExpired(launch, atExpiry), true)
  assert.equal(hasLaunchWindowExpired(launch, atExpiry + 1), true)
})

test('selectProjectRoomsToArchiveOnLaunch archives all rooms on first expiry', () => {
  assert.deepEqual(
    selectProjectRoomsToArchiveOnLaunch({
      previousLaunchExpired: false,
      nextLaunchExpired: true,
      nextRooms: rooms,
      addedRooms: added,
    }),
    rooms
  )
})

test('selectProjectRoomsToArchiveOnLaunch only archives newly added rooms after expiry', () => {
  assert.deepEqual(
    selectProjectRoomsToArchiveOnLaunch({
      previousLaunchExpired: true,
      nextLaunchExpired: true,
      nextRooms: rooms,
      addedRooms: added,
    }),
    added
  )
})

test('selectProjectRoomsToArchiveOnLaunch does nothing while launch is still open', () => {
  assert.deepEqual(
    selectProjectRoomsToArchiveOnLaunch({
      previousLaunchExpired: false,
      nextLaunchExpired: false,
      nextRooms: rooms,
      addedRooms: added,
    }),
    []
  )
})

test('getPreLaunchDeadline is the calendar day before launch', () => {
  assert.equal(getPreLaunchDeadline('2026-08-20'), '2026-08-19')
  assert.equal(getPreLaunchDeadline(''), '')
  assert.equal(getPreLaunchDeadline('not-a-date'), '')
})

test('clampProjectDeadline never allows a deadline on or after launch', () => {
  assert.equal(clampProjectDeadline('2026-08-19', '2026-08-20'), '2026-08-19')
  assert.equal(clampProjectDeadline('2026-08-20', '2026-08-20'), '2026-08-19')
  assert.equal(clampProjectDeadline('2026-08-25', '2026-08-20'), '2026-08-19')
  assert.equal(clampProjectDeadline('2026-08-10', '2026-08-20'), '2026-08-10')
  assert.equal(clampProjectDeadline('', '2026-08-20'), '')
  assert.equal(clampProjectDeadline('2026-08-25', ''), '2026-08-25')
})
