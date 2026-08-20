const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildGeneralRoomId,
  deriveGeneralRoomParticipants,
  buildAutoGeneralRoom,
} = require('../src/lib/projectGeneralRoom')

test('deriveGeneralRoomParticipants includes owner, sponsor, and block owners only', () => {
  assert.deepEqual(
    deriveGeneralRoomParticipants({
      owner: 'Patrícia',
      sponsor: 'Sara',
      blocks: [{ owner: 'Bloc Cap' }, { owner: 'Patrícia' }, { owner: '' }],
      extraParticipants: ['Extra', 'Sara'],
    }),
    ['Patrícia', 'Sara', 'Bloc Cap', 'Extra']
  )
})

test('deriveGeneralRoomParticipants does not auto-add task-only owners', () => {
  const participants = deriveGeneralRoomParticipants({
    owner: 'Patrícia',
    blocks: [
      {
        owner: 'Bloc Cap',
        tasks: [{ owner: 'Tasca Owner' }],
      },
    ],
  })
  assert.deepEqual(participants, ['Patrícia', 'Bloc Cap'])
  assert.equal(participants.includes('Tasca Owner'), false)
})

test('buildAutoGeneralRoom rejects non-general ids and preserves extras', () => {
  assert.equal(buildGeneralRoomId('p1'), 'room-general-p1')
  assert.equal(buildAutoGeneralRoom({ owner: 'Patrícia' }, 'p1', 'room-other'), null)

  const room = buildAutoGeneralRoom(
    {
      owner: 'Patrícia',
      sponsor: 'Sara',
      departments: ['Serveis'],
      blocks: [{ owner: 'Bloc Cap' }],
      rooms: [
        {
          id: 'room-general-p1',
          opsChannelId: 'ch-1',
          notes: 'keep',
          participants: ['Extra'],
        },
      ],
    },
    'p1'
  )

  assert.equal(room.id, 'room-general-p1')
  assert.equal(room.kind, 'general')
  assert.equal(room.opsChannelId, 'ch-1')
  assert.equal(room.notes, 'keep')
  assert.deepEqual(room.departments, ['Serveis'])
  assert.deepEqual(room.participants, ['Patrícia', 'Sara', 'Bloc Cap', 'Extra'])
})
