const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  collectProjectOutlookCalendarRefs,
} = require('../src/lib/projects/outlookCalendarCleanup')

test('collects block and task deadline Outlook series before project delete', () => {
  const refs = collectProjectOutlookCalendarRefs({
    blocks: [
      {
        id: 'block-1',
        outlookEventId: 'block-event',
        outlookEventEmail: 'owner@calblay.com',
        tasks: [
          {
            id: 'task-1',
            outlookEventId: 'task-event',
            outlookEventEmail: 'task.owner@calblay.com',
          },
        ],
      },
    ],
  })

  assert.deepEqual(refs, [
    { email: 'owner@calblay.com', eventId: 'block-event' },
    { email: 'task.owner@calblay.com', eventId: 'task-event' },
  ])
})

test('collects kickoff and nested meeting Graph events', () => {
  const refs = collectProjectOutlookCalendarRefs({
    kickoff: {
      organizerEmail: 'pm@calblay.com',
      graphEventId: 'kickoff-event',
    },
    blocks: [
      {
        id: 'block-1',
        meetings: [
          {
            organizerEmail: 'pm@calblay.com',
            graphEventId: 'block-meeting',
          },
        ],
        tasks: [
          {
            id: 'task-1',
            meetings: [
              {
                organizerEmail: 'ops@calblay.com',
                graphEventId: 'task-meeting',
              },
            ],
          },
        ],
      },
    ],
  })

  assert.deepEqual(refs, [
    { email: 'pm@calblay.com', eventId: 'kickoff-event' },
    { email: 'pm@calblay.com', eventId: 'block-meeting' },
    { email: 'ops@calblay.com', eventId: 'task-meeting' },
  ])
})

test('skips incomplete refs and dedupes identical calendar events', () => {
  const refs = collectProjectOutlookCalendarRefs({
    kickoff: { organizerEmail: ' ', graphEventId: 'missing-email' },
    blocks: [
      {
        outlookEventId: 'shared-event',
        outlookEventEmail: 'Owner@calblay.com',
        tasks: [
          {
            outlookEventId: 'shared-event',
            outlookEventEmail: 'owner@calblay.com',
          },
          {
            outlookEventId: '   ',
            outlookEventEmail: 'nobody@calblay.com',
          },
        ],
      },
    ],
  })

  assert.deepEqual(refs, [{ email: 'Owner@calblay.com', eventId: 'shared-event' }])
})

test('returns no refs for empty or missing project payloads', () => {
  assert.deepEqual(collectProjectOutlookCalendarRefs(null), [])
  assert.deepEqual(collectProjectOutlookCalendarRefs({}), [])
  assert.deepEqual(collectProjectOutlookCalendarRefs({ blocks: [{ tasks: [{}] }] }), [])
})

test('DELETE /api/projects/[id] cleans Outlook events before Firestore delete', () => {
  const routePath = path.join(__dirname, '..', 'src', 'app', 'api', 'projects', '[id]', 'route.ts')
  const source = fs.readFileSync(routePath, 'utf8')
  const collectIdx = source.indexOf('collectProjectOutlookCalendarRefs(data)')
  const deleteIdx = source.indexOf('deleteOutlookCalendarEvent(calendarRef.email, calendarRef.eventId)')
  const firestoreIdx = source.indexOf('await deleteDocsInChunks([')

  assert.ok(collectIdx > 0, 'DELETE collects Outlook refs from the project document')
  assert.ok(deleteIdx > collectIdx, 'DELETE deletes each collected Outlook event')
  assert.ok(firestoreIdx > deleteIdx, 'Outlook cleanup runs before Firestore document deletion')
})
