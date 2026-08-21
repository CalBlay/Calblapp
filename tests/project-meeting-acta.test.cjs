const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canOpenMeetingActaForScope,
  canOpenMeetingActaInBlocks,
  canOpenMeetingActaInTasks,
  isKickoffOrganizer,
  isUserMeetingOrganizer,
} = require('../src/app/menu/projects/components/project-meeting-acta')

const organizer = { id: 'u-org', email: 'Org@Calblay.com', name: 'Oriol' }
const other = { id: 'u-other', email: 'other@calblay.com', name: 'Anna' }

function projectWithMeetings() {
  return {
    id: 'p1',
    kickoff: {
      graphEventId: 'kick-1',
      organizerUserId: 'u-org',
      organizerEmail: 'org@calblay.com',
      minutesAuthor: 'Oriol',
      status: 'sent',
    },
    blocks: [
      {
        id: 'b1',
        meetings: [
          {
            id: 'm-block',
            organizerUserId: 'u-block',
            organizerEmail: 'block@calblay.com',
          },
        ],
        tasks: [
          {
            id: 't1',
            meetings: [
              {
                id: 'm-task',
                organizerUserId: 'u-task',
                organizerEmail: 'task@calblay.com',
              },
            ],
          },
        ],
      },
    ],
  }
}

test('isUserMeetingOrganizer matches organizer id or case-insensitive email', () => {
  const record = { organizerUserId: 'u-org', organizerEmail: 'org@calblay.com' }
  assert.equal(isUserMeetingOrganizer(organizer, record), true)
  assert.equal(
    isUserMeetingOrganizer({ id: '', email: '  ORG@calblay.com  ' }, record),
    true
  )
  assert.equal(isUserMeetingOrganizer(other, record), false)
  assert.equal(isUserMeetingOrganizer(organizer, undefined), false)
})

test('isKickoffOrganizer requires a scheduled kickoff before minutes-author fallback', () => {
  assert.equal(
    isKickoffOrganizer(organizer, {
      minutesAuthor: 'Oriol',
      graphEventId: '',
      graphWebLink: '',
      status: '',
    }),
    false
  )
  assert.equal(
    isKickoffOrganizer(
      { id: 'u-other', email: 'other@calblay.com', name: 'Oriol' },
      { minutesAuthor: 'Oriol', graphEventId: 'kick-1' }
    ),
    true
  )
  assert.equal(
    isKickoffOrganizer(
      { id: 'u-other', email: 'other@calblay.com', name: 'oriol' },
      { minutesAuthor: 'Oriol', graphEventId: 'kick-1' }
    ),
    false
  )
})

test('block acta is kickoff or block organizers only; task acta is task organizers only', () => {
  const project = projectWithMeetings()
  const blockOrganizer = { id: 'u-block', email: 'block@calblay.com' }
  const taskOrganizer = { id: 'u-task', email: 'task@calblay.com' }

  assert.equal(canOpenMeetingActaInBlocks(organizer, project), true)
  assert.equal(canOpenMeetingActaInBlocks(blockOrganizer, project), true)
  assert.equal(canOpenMeetingActaInBlocks(taskOrganizer, project), false)

  assert.equal(canOpenMeetingActaInTasks(taskOrganizer, project), true)
  assert.equal(canOpenMeetingActaInTasks(blockOrganizer, project), false)
  assert.equal(canOpenMeetingActaInTasks(organizer, project), false)
})

test('canOpenMeetingActaForScope denies missing ids and scopes to the named meeting', () => {
  const project = projectWithMeetings()
  const blockOrganizer = { id: 'u-block', email: 'block@calblay.com' }
  const taskOrganizer = { id: 'u-task', email: 'task@calblay.com' }

  assert.equal(canOpenMeetingActaForScope(organizer, project, 'kickoff'), true)
  assert.equal(canOpenMeetingActaForScope(blockOrganizer, project, 'block'), false)
  assert.equal(
    canOpenMeetingActaForScope(blockOrganizer, project, 'block', { blockId: 'b1' }),
    true
  )
  assert.equal(
    canOpenMeetingActaForScope(blockOrganizer, project, 'block', {
      blockId: 'b1',
      meetingId: 'missing',
    }),
    false
  )
  assert.equal(
    canOpenMeetingActaForScope(taskOrganizer, project, 'task', {
      blockId: 'b1',
      taskId: 't1',
      meetingId: 'm-task',
    }),
    true
  )
  assert.equal(
    canOpenMeetingActaForScope(taskOrganizer, project, 'task', { blockId: 'b1' }),
    false
  )
})
