const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  collectRemovedBlockOutlookCalendarRefs,
} = require('../src/lib/projects/removedBlockOutlookCleanup')

test('collects Outlook series when a block is removed from PATCH payload', () => {
  const refs = collectRemovedBlockOutlookCalendarRefs(
    [
      {
        id: 'block-keep',
        outlookEventId: 'keep-event',
        outlookEventEmail: 'keep@calblay.com',
        tasks: [],
      },
      {
        id: 'block-gone',
        outlookEventId: 'block-event',
        outlookEventEmail: 'owner@calblay.com',
        meetings: [{ organizerEmail: 'pm@calblay.com', graphEventId: 'block-meeting' }],
        tasks: [
          {
            id: 'task-1',
            outlookEventId: 'task-event',
            outlookEventEmail: 'task.owner@calblay.com',
            meetings: [{ organizerEmail: 'ops@calblay.com', graphEventId: 'task-meeting' }],
          },
        ],
      },
    ],
    [
      {
        id: 'block-keep',
        outlookEventId: 'keep-event',
        outlookEventEmail: 'keep@calblay.com',
        tasks: [],
      },
    ]
  )

  assert.deepEqual(refs, [
    { email: 'owner@calblay.com', eventId: 'block-event' },
    { email: 'pm@calblay.com', eventId: 'block-meeting' },
    { email: 'task.owner@calblay.com', eventId: 'task-event' },
    { email: 'ops@calblay.com', eventId: 'task-meeting' },
  ])
})

test('collects Outlook series when a task is removed from a remaining block', () => {
  const refs = collectRemovedBlockOutlookCalendarRefs(
    [
      {
        id: 'block-1',
        outlookEventId: 'block-event',
        outlookEventEmail: 'owner@calblay.com',
        tasks: [
          {
            id: 'task-keep',
            outlookEventId: 'keep-task-event',
            outlookEventEmail: 'keep@calblay.com',
          },
          {
            id: 'task-gone',
            outlookEventId: 'gone-task-event',
            outlookEventEmail: 'gone@calblay.com',
            meetings: [{ organizerEmail: 'ops@calblay.com', graphEventId: 'gone-meeting' }],
          },
        ],
      },
    ],
    [
      {
        id: 'block-1',
        outlookEventId: 'block-event',
        outlookEventEmail: 'owner@calblay.com',
        tasks: [
          {
            id: 'task-keep',
            outlookEventId: 'keep-task-event',
            outlookEventEmail: 'keep@calblay.com',
          },
        ],
      },
    ]
  )

  assert.deepEqual(refs, [
    { email: 'gone@calblay.com', eventId: 'gone-task-event' },
    { email: 'ops@calblay.com', eventId: 'gone-meeting' },
  ])
})

test('returns no refs when blocks are unchanged or payload omits ids', () => {
  const blocks = [
    {
      id: 'block-1',
      outlookEventId: 'block-event',
      outlookEventEmail: 'owner@calblay.com',
      tasks: [{ id: 'task-1', outlookEventId: 'task-event', outlookEventEmail: 'task@calblay.com' }],
    },
  ]

  assert.deepEqual(collectRemovedBlockOutlookCalendarRefs(blocks, blocks), [])
  assert.deepEqual(collectRemovedBlockOutlookCalendarRefs(blocks, undefined), [
    { email: 'owner@calblay.com', eventId: 'block-event' },
    { email: 'task@calblay.com', eventId: 'task-event' },
  ])
  assert.deepEqual(collectRemovedBlockOutlookCalendarRefs(null, []), [])
  assert.deepEqual(
    collectRemovedBlockOutlookCalendarRefs(
      [{ outlookEventId: 'no-id', outlookEventEmail: 'owner@calblay.com' }],
      []
    ),
    [{ email: 'owner@calblay.com', eventId: 'no-id' }]
  )
})

test('skips incomplete refs and dedupes identical calendar events', () => {
  const refs = collectRemovedBlockOutlookCalendarRefs(
    [
      {
        id: 'block-1',
        outlookEventId: 'shared-event',
        outlookEventEmail: 'Owner@calblay.com',
        tasks: [
          {
            id: 'task-1',
            outlookEventId: 'shared-event',
            outlookEventEmail: 'owner@calblay.com',
          },
          {
            id: 'task-2',
            outlookEventId: '   ',
            outlookEventEmail: 'nobody@calblay.com',
          },
        ],
      },
    ],
    []
  )

  assert.deepEqual(refs, [{ email: 'Owner@calblay.com', eventId: 'shared-event' }])
})

test('project PATCH deletes Outlook events for removed blocks before after() persist', () => {
  const routePath = path.join(__dirname, '..', 'src', 'app', 'api', 'projects', '[id]', 'route.ts')
  const source = fs.readFileSync(routePath, 'utf8')
  const helperIdx = source.indexOf('collectRemovedBlockOutlookCalendarRefs(currentBlocks, nextBlocks)')
  const deleteIdx = source.indexOf('deleteOutlookCalendarEvent(calendarRef.email, calendarRef.eventId)')
  const afterIdx = source.indexOf('after(async () => {')

  assert.ok(helperIdx > 0, 'PATCH diffs current vs next blocks for removed Outlook refs')
  assert.ok(afterIdx > 0, 'PATCH schedules Outlook work after the response')
  assert.ok(deleteIdx > helperIdx, 'PATCH deletes each removed-block Outlook event')
})

test('room PATCH deletes Outlook events for tasks removed from a linked block', () => {
  const routePath = path.join(
    __dirname,
    '..',
    'src',
    'app',
    'api',
    'projects',
    '[id]',
    'rooms',
    '[roomId]',
    'route.ts'
  )
  const source = fs.readFileSync(routePath, 'utf8')
  const helperIdx = source.indexOf('collectRemovedBlockOutlookCalendarRefs(')
  const deleteIdx = source.indexOf('deleteOutlookCalendarEvent(calendarRef.email, calendarRef.eventId)')

  assert.ok(helperIdx > 0, 'room PATCH diffs previous vs next tasks for removed Outlook refs')
  assert.ok(deleteIdx > helperIdx, 'room PATCH deletes each removed-task Outlook event')
})
