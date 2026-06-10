const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  filterUsersForGuestSearch,
  findUserForCoreName,
  mergeMeetingAttendees,
  resolveCoreMeetingAttendees,
  resolveMergedAttendeeEmail,
} = require('../src/lib/incidentMeetingAttendees')
const {
  activeMeetingAttendees,
  meetingAttendeesForFirestore,
  meetingFiltersForFirestore,
  normalizeMeetingAttendance,
  serializeMeetingSession,
} = require('../src/lib/incidentMeetingSession')

test('core attendee resolution disambiguates similar names with email hints', () => {
  const users = [
    {
      id: 'sonia-planas',
      name: 'Sonia Planas',
      email: 'sonia.planas@example.test',
      department: 'Produccio',
    },
    {
      id: 'sonia-albet',
      name: 'Sonia Albet',
      email: 's.albet@example.test',
      department: 'Direccio',
    },
    {
      id: 'oriol',
      name: 'Oriol',
      email: 'oriol@example.test',
      department: 'Logistica',
    },
  ]

  assert.equal(findUserForCoreName(users, 'Sonia Albet')?.id, 'sonia-albet')

  const attendees = resolveCoreMeetingAttendees(users)
  const sonia = attendees.find((row) => row.name === 'Sonia Albet')
  assert.equal(sonia?.key, 'core:sonia-albet')
  assert.equal(sonia?.email, 's.albet@example.test')
  assert.equal(sonia?.receiveEmail, true)
})

test('mergeMeetingAttendees preserves saved attendance when a fixed attendee user changes', () => {
  const saved = [
    {
      key: 'core:old-sonia',
      userId: 'old-sonia',
      name: 'Sonia Planas',
      email: 'manual.sonia@example.test',
      department: 'Produccio',
      attendance: 'online',
      absenceReason: '',
      receiveEmail: false,
    },
    {
      key: 'guest:external@example.test',
      userId: '',
      name: 'External Guest',
      email: 'external@example.test',
      department: '',
      attendance: 'absent',
      absenceReason: 'Travel',
      receiveEmail: true,
    },
  ]
  const core = [
    {
      key: 'core:new-sonia',
      userId: 'new-sonia',
      name: 'Sonia Albet',
      email: 'directory.sonia@example.test',
      department: 'Direccio',
      attendance: null,
      absenceReason: '',
      receiveEmail: true,
    },
  ]

  const merged = mergeMeetingAttendees(saved, core)

  assert.equal(merged.length, 2)
  assert.deepEqual(merged[0], {
    key: 'core:new-sonia',
    userId: 'new-sonia',
    name: 'Sonia Albet',
    email: 'manual.sonia@example.test',
    department: 'Direccio',
    attendance: 'online',
    absenceReason: '',
    receiveEmail: false,
  })
  assert.equal(merged[1].key, 'guest:external@example.test')
})

test('attendee email and guest search rules avoid wrong recipients', () => {
  assert.equal(
    resolveMergedAttendeeEmail(
      { email: ' Manual.Person@Example.TEST ' },
      { email: 'directory@example.test' }
    ),
    'manual.person@example.test'
  )
  assert.equal(
    resolveMergedAttendeeEmail({ email: 'not-an-email' }, { email: 'Core@Example.TEST ' }),
    'core@example.test'
  )

  const users = [
    { id: '1', name: 'Ada Lovelace', email: 'ada@example.test', department: 'Direccio' },
    { id: '2', name: 'Grace Hopper', email: 'grace@example.test', department: 'Sistemes' },
    { id: '3', name: 'No Mail', email: '', department: 'Sistemes' },
  ]

  assert.deepEqual(
    filterUsersForGuestSearch(users, 'sistemes grace', new Set(['1'])).map((u) => u.id),
    ['2']
  )
  assert.deepEqual(
    filterUsersForGuestSearch(users, '', new Set(['2'])).map((u) => u.id),
    ['1']
  )
})

test('meeting session helpers normalize legacy attendance and recipient opt-outs', () => {
  assert.equal(normalizeMeetingAttendance({ attended: true }), 'in_person')
  assert.equal(normalizeMeetingAttendance({ attended: false }), 'absent')
  assert.equal(normalizeMeetingAttendance({ attendance: 'online', attended: false }), 'online')
  assert.equal(normalizeMeetingAttendance({ attendance: 'unknown' }), null)

  const attendees = [
    {
      key: 'core:ada',
      userId: 'ada',
      name: 'Ada',
      email: 'ada@example.test',
      attendance: 'in_person',
      receiveEmail: true,
    },
    {
      key: 'guest:grace@example.test',
      userId: '',
      name: 'Grace',
      email: 'grace@example.test',
      attendance: 'online',
      receiveEmail: false,
    },
  ]

  assert.deepEqual(activeMeetingAttendees(attendees).map((a) => a.key), ['core:ada'])
  assert.deepEqual(meetingAttendeesForFirestore(attendees), [
    {
      key: 'core:ada',
      userId: 'ada',
      name: 'Ada',
      email: 'ada@example.test',
      department: '',
      attendance: 'in_person',
      attended: true,
      absenceReason: '',
    },
    {
      key: 'guest:grace@example.test',
      userId: '',
      name: 'Grace',
      email: 'grace@example.test',
      department: '',
      attendance: 'online',
      attended: true,
      absenceReason: '',
      receiveEmail: false,
    },
  ])
})

test('serializeMeetingSession drops invalid guests and Firestore filters omit empty fields', () => {
  assert.deepEqual(
    meetingFiltersForFirestore({
      from: ' 2026-06-01 ',
      to: '',
      department: '   ',
      importance: '',
      categoryLabel: 'all',
      status: 'all',
    }),
    {
      importance: 'all',
      categoryLabel: 'all',
      status: 'all',
      from: '2026-06-01',
    }
  )

  const session = serializeMeetingSession('session-1', {
    status: 'finalized',
    notes: 'Notes',
    incidentFilters: {
      from: '2026-06-01',
      to: '2026-06-02',
      department: '',
      importance: 'urgent',
      categoryLabel: '9XX',
      status: 'resolt',
    },
    attendees: [
      {
        key: 'user:valid@example.test',
        userId: '',
        name: '',
        email: ' valid@example.test ',
        attended: true,
      },
      {
        key: 'core:name:fred',
        userId: '',
        name: 'Fred',
        email: '',
        attendance: 'absent',
        absenceReason: 'Vacances',
        receiveEmail: false,
      },
      {
        key: 'guest:no-mail',
        name: 'No Mail',
        email: '',
      },
    ],
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T11:00:00.000Z',
    finalizedAt: '2026-06-01T12:00:00.000Z',
    finalizedById: 'user-1',
    finalizedByName: 'Ada',
  })

  assert.equal(session.status, 'finalized')
  assert.deepEqual(session.incidentFilters, {
    from: '2026-06-01',
    to: '2026-06-02',
    department: undefined,
    importance: 'urgent',
    categoryLabel: '9XX',
    status: 'resolt',
  })
  assert.deepEqual(
    session.attendees.map((a) => ({
      key: a.key,
      name: a.name,
      email: a.email,
      attendance: a.attendance,
      receiveEmail: a.receiveEmail,
    })),
    [
      {
        key: 'user:valid@example.test',
        name: 'valid@example.test',
        email: 'valid@example.test',
        attendance: 'in_person',
        receiveEmail: true,
      },
      {
        key: 'core:name:fred',
        name: 'Fred',
        email: '',
        attendance: 'absent',
        receiveEmail: false,
      },
    ]
  )
  assert.equal(session.finalizedByName, 'Ada')
})
