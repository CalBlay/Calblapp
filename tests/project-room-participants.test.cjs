const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  roomParticipantsFingerprint,
} = require('../src/lib/projectRoomFingerprint')
const {
  deriveKickoffAttendees,
  ensureProjectRooms,
} = require('../src/app/menu/projects/components/project-workspace-state')

function projectFixture(overrides = {}) {
  return {
    id: 'proj-1',
    name: 'Nou CRM',
    sponsor: 'Impulsor',
    owner: 'Responsable',
    context: '',
    strategy: '',
    risks: '',
    startDate: '',
    launchDate: '',
    budget: '',
    departments: ['Marqueting'],
    phase: 'planning',
    status: 'planning',
    sprints: [],
    document: null,
    documents: [],
    kickoff: {
      date: '',
      startTime: '',
      durationMinutes: 60,
      notes: '',
      minutes: '',
      excludedKeys: [],
      attendees: [],
      status: '',
      graphWebLink: '',
    },
    blocks: [
      {
        id: 'block-1',
        name: 'Integració',
        summary: '',
        department: 'Marqueting',
        departments: ['Marqueting'],
        owner: 'Cap Bloc',
        deadline: '',
        budget: '',
        dependsOn: 'none',
        status: 'pending',
        tasks: [
          {
            id: 'task-1',
            title: 'API',
            owner: 'Tasca Owner',
            deadline: '',
            dependsOn: '',
            priority: 'normal',
            status: 'pending',
          },
        ],
      },
    ],
    rooms: [],
    ...overrides,
  }
}

test('roomParticipantsFingerprint is order-independent and ignores blank names', () => {
  assert.equal(
    roomParticipantsFingerprint({ participants: ['Berta', 'Anna'] }),
    roomParticipantsFingerprint({ participants: [' Anna ', 'Berta'] })
  )
  assert.equal(roomParticipantsFingerprint({ participants: ['', '  ', null] }), '')
  assert.equal(roomParticipantsFingerprint({}), '')
  assert.equal(
    roomParticipantsFingerprint({ participants: ['Anna', 'Anna'] }),
    'Anna|Anna'
  )
})

test('ensureProjectRooms keeps task owners in block rooms but not the general room', () => {
  const existing = projectFixture({
    rooms: [
      {
        id: 'room-general-proj-1',
        name: 'Coordinació general',
        kind: 'general',
        departments: ['Marqueting'],
        participants: ['Extra'],
        notes: 'keep-notes',
        opsChannelId: 'project_room_proj-1_room-general-proj-1',
        documents: [],
        messages: [],
      },
    ],
  })

  const next = ensureProjectRooms(existing, new Map())
  const general = next.rooms.find((room) => room.kind === 'general')
  const block = next.rooms.find((room) => room.kind === 'block')

  assert.equal(general.id, 'room-general-proj-1')
  assert.equal(general.notes, 'keep-notes')
  assert.equal(general.opsChannelId, 'project_room_proj-1_room-general-proj-1')
  assert.deepEqual(general.participants.sort(), ['Cap Bloc', 'Extra', 'Impulsor', 'Responsable'])
  assert.equal(general.participants.includes('Tasca Owner'), false)

  assert.equal(block.id, 'room-block-block-1')
  assert.equal(block.blockId, 'block-1')
  assert.deepEqual(
    [...block.participants].sort(),
    ['Cap Bloc', 'Responsable', 'Tasca Owner']
  )
})

test('deriveKickoffAttendees auto-adds department caps and honors excluded keys and missing emails', () => {
  const users = [
    {
      id: 'u-owner',
      name: 'Responsable',
      role: 'admin',
      email: 'owner@calblay.com',
      department: 'Direccio',
    },
    {
      id: 'u-cap',
      name: 'Cap MKT',
      role: 'cap',
      email: 'cap@calblay.com',
      department: 'Marketing',
    },
    {
      id: 'u-no-mail',
      name: 'Cap Sense Mail',
      role: 'cap',
      email: '',
      department: 'Marqueting',
    },
  ]
  const byName = new Map(users.map((user) => [user.name, user]))
  const project = projectFixture({
    kickoff: {
      date: '',
      startTime: '',
      durationMinutes: 60,
      notes: '',
      minutes: '',
      excludedKeys: ['user:u-owner'],
      attendees: [],
      status: '',
      graphWebLink: '',
    },
  })

  const attendees = deriveKickoffAttendees(project, users, byName)
  assert.deepEqual(
    attendees.map((item) => item.key),
    ['user:u-cap']
  )
  assert.equal(attendees[0].department, 'Marqueting')
})
