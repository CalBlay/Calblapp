const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  findUserForCoreName,
  resolveCoreMeetingAttendees,
  resolveMergedAttendeeEmail,
  mergeMeetingAttendees,
  filterUsersForGuestSearch,
  foldPersonText,
  isCoreAttendeeKey,
} = require('../src/lib/incidentMeetingAttendees')

const {
  isMeetingEmailRecipient,
  activeMeetingAttendees,
  normalizeMeetingAttendance,
  attendedFromMeetingAttendance,
  defaultMeetingIncidentFilters,
  meetingFiltersForFirestore,
  meetingAttendeesForFirestore,
  serializeMeetingSession,
} = require('../src/lib/incidentMeetingSession')

const user = (id, name, email, department = 'Direcció') => ({
  id,
  name,
  email,
  department,
})

test('findUserForCoreName prefers Sonia Albet and excludes Sonia Planas', () => {
  const users = [
    user('p1', 'Sonia Planas', 'sonia.planas@calblay.com'),
    user('a1', 'Sònia Albet', 'sonia.albet@calblay.com'),
    user('o1', 'Oriol Puig', 'oriol@calblay.com'),
  ]

  const sonia = findUserForCoreName(users, 'Sonia Albet')
  assert.equal(sonia && sonia.id, 'a1')

  const oriol = findUserForCoreName(users, 'Oriol')
  assert.equal(oriol && oriol.id, 'o1')

  assert.equal(findUserForCoreName(users, 'Nobody'), null)
  assert.equal(foldPersonText('Sònia'), 'sonia')
})

test('resolveCoreMeetingAttendees keeps placeholders for unmatched names and does not reuse ids', () => {
  const rows = resolveCoreMeetingAttendees([user('o1', 'Oriol Puig', 'oriol@calblay.com')])
  const oriol = rows.find((row) => row.userId === 'o1')
  assert.ok(oriol)
  assert.equal(oriol.key, 'core:o1')
  assert.equal(oriol.receiveEmail, true)

  const missing = rows.find((row) => row.name === 'David')
  assert.ok(missing)
  assert.equal(missing.userId, '')
  assert.equal(missing.key, `core:name:${foldPersonText('David')}`)
  assert.equal(rows.filter((row) => row.userId === 'o1').length, 1)
})

test('resolveMergedAttendeeEmail prefers a saved address that looks like email', () => {
  assert.equal(
    resolveMergedAttendeeEmail({ email: 'Saved@Calblay.com' }, { email: 'core@calblay.com' }),
    'saved@calblay.com'
  )
  assert.equal(
    resolveMergedAttendeeEmail({ email: 'not-an-email' }, { email: 'Core@calblay.com' }),
    'core@calblay.com'
  )
  assert.equal(resolveMergedAttendeeEmail({ email: '' }, { email: '' }), '')
})

test('mergeMeetingAttendees keeps attendance, migrates core key changes, and preserves guests', () => {
  const core = [
    {
      key: 'core:a1',
      userId: 'a1',
      name: 'Sonia Albet',
      email: 'sonia.albet@calblay.com',
      department: 'Direcció',
      attendance: null,
      absenceReason: '',
      receiveEmail: true,
    },
  ]
  const saved = [
    {
      key: 'core:old',
      userId: 'old',
      name: 'Sonia Planas',
      email: 'manual@calblay.com',
      department: 'Direcció',
      attendance: 'absent',
      absenceReason: 'viatge',
      receiveEmail: false,
    },
    {
      key: 'guest:g1',
      userId: 'g1',
      name: 'Convidat',
      email: 'guest@calblay.com',
      department: 'Serveis',
      attendance: 'online',
      absenceReason: '',
      receiveEmail: true,
    },
  ]

  const merged = mergeMeetingAttendees(saved, core)
  assert.equal(merged[0].key, 'core:a1')
  assert.equal(merged[0].attendance, 'absent')
  assert.equal(merged[0].absenceReason, 'viatge')
  assert.equal(merged[0].email, 'manual@calblay.com')
  assert.equal(merged[0].receiveEmail, false)
  assert.equal(merged[1].key, 'guest:g1')
  assert.equal(isCoreAttendeeKey('core:a1'), true)
  assert.equal(isCoreAttendeeKey('guest:g1'), false)
})

test('filterUsersForGuestSearch requires @, excludes ids, and matches folded tokens', () => {
  const users = [
    user('1', 'Anna Riu', 'anna@calblay.com', 'Cuina'),
    user('2', 'Marc', 'no-email', 'Cuina'),
    user('3', 'Pau Costa', 'pau@calblay.com', 'Serveis'),
  ]
  const hits = filterUsersForGuestSearch(users, 'anna riu', new Set())
  assert.deepEqual(
    hits.map((u) => u.id),
    ['1']
  )
  assert.equal(filterUsersForGuestSearch(users, '', new Set(['1'])).every((u) => u.id !== '1'), true)
  assert.equal(
    filterUsersForGuestSearch(users, '', new Set()).some((u) => u.id === '2'),
    false
  )
})

test('normalizeMeetingAttendance maps explicit values and legacy attended booleans', () => {
  assert.equal(normalizeMeetingAttendance({ attendance: 'online' }), 'online')
  assert.equal(normalizeMeetingAttendance({ attendance: 'weird', attended: true }), 'in_person')
  assert.equal(normalizeMeetingAttendance({ attended: false }), 'absent')
  assert.equal(normalizeMeetingAttendance({}), null)
  assert.equal(attendedFromMeetingAttendance('in_person'), true)
  assert.equal(attendedFromMeetingAttendance('online'), true)
  assert.equal(attendedFromMeetingAttendance('absent'), false)
  assert.equal(attendedFromMeetingAttendance(null), null)
})

test('meetingFiltersForFirestore omits empty from/to/department so Firestore never stores undefined', () => {
  assert.deepEqual(meetingFiltersForFirestore(defaultMeetingIncidentFilters()), {
    importance: 'all',
    categoryLabel: 'all',
    status: 'all',
  })
  assert.deepEqual(
    meetingFiltersForFirestore(
      defaultMeetingIncidentFilters({ from: '2026-08-01', to: '  ', department: 'Cuina' })
    ),
    {
      importance: 'all',
      categoryLabel: 'all',
      status: 'all',
      from: '2026-08-01',
      department: 'Cuina',
    }
  )
})

test('meetingAttendeesForFirestore only writes receiveEmail when it is false', () => {
  const rows = meetingAttendeesForFirestore([
    {
      key: 'core:1',
      userId: '1',
      name: 'Oriol',
      email: 'oriol@calblay.com',
      attendance: 'online',
      receiveEmail: true,
    },
    {
      key: 'guest:2',
      userId: '',
      name: 'Guest',
      email: 'g@calblay.com',
      attendance: 'absent',
      receiveEmail: false,
    },
  ])
  assert.equal(rows[0].attended, true)
  assert.equal('receiveEmail' in rows[0], false)
  assert.equal(rows[1].receiveEmail, false)
  assert.equal(rows[1].attended, false)
})

test('serializeMeetingSession drops guests without email, keeps core placeholders, and defaults status', () => {
  const session = serializeMeetingSession('s1', {
    status: 'unknown',
    notes: 'acta',
    attendees: [
      { key: 'core:name:david', name: 'David', email: '' },
      { name: 'No Mail', email: 'not-an-email', userId: 'x' },
      { userId: 'g1', email: 'guest@calblay.com', name: 'Guest', receiveEmail: false, attended: true },
    ],
    incidentFilters: { from: '2026-08-01', importance: 'alta' },
  })

  assert.equal(session.status, 'draft')
  assert.equal(session.attendees.length, 2)
  assert.equal(session.attendees[0].key, 'core:name:david')
  assert.equal(session.attendees[1].key, 'user:g1')
  assert.equal(session.attendees[1].attendance, 'in_person')
  assert.equal(session.attendees[1].receiveEmail, false)
  assert.equal(session.incidentFilters.from, '2026-08-01')
  assert.equal(session.incidentFilters.importance, 'alta')
})

test('activeMeetingAttendees excludes people who opted out of email', () => {
  const rows = [
    { key: 'a', userId: '1', name: 'A', email: 'a@x.com', attendance: null, receiveEmail: true },
    { key: 'b', userId: '2', name: 'B', email: 'b@x.com', attendance: null, receiveEmail: false },
    { key: 'c', userId: '3', name: 'C', email: 'c@x.com', attendance: null },
  ]
  assert.equal(isMeetingEmailRecipient(rows[1]), false)
  assert.deepEqual(
    activeMeetingAttendees(rows).map((row) => row.key),
    ['a', 'c']
  )
})
