const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  appendProjectMeetingToBlocks,
} = require('../src/lib/projects/appendProjectMeeting')

function meeting(id, extra = {}) {
  return {
    id,
    scope: extra.scope || 'block',
    title: extra.title || 'Reunio',
    date: '2026-09-01',
    startTime: '10:00',
    durationMinutes: 60,
    notes: '',
    attendees: [],
    graphEventId: extra.graphEventId || `graph-${id}`,
  }
}

test('appending a block meeting keeps sibling blocks and local task edits', () => {
  const result = appendProjectMeetingToBlocks(
    [
      {
        id: 'block-keep',
        name: 'Keep',
        summary: '',
        department: 'Serveis',
        departments: ['Serveis'],
        owner: 'Anna',
        deadline: '2026-10-01',
        budget: '',
        dependsOn: '',
        status: 'pending',
        outlookEventId: 'outlook-keep',
        tasks: [{ id: 'task-keep', title: 'Edited locally', owner: 'Anna', deadline: '2026-09-15', dependsOn: '', priority: 'normal', status: 'pending' }],
      },
      {
        id: 'block-target',
        name: 'Target',
        summary: '',
        department: 'Cuina',
        departments: ['Cuina'],
        owner: 'Berta',
        deadline: '2026-11-01',
        budget: '',
        dependsOn: '',
        status: 'pending',
        tasks: [{ id: 'task-1', title: 'Unsaved title', owner: 'Berta', deadline: '2026-09-20', dependsOn: '', priority: 'normal', status: 'pending' }],
      },
    ],
    {
      scope: 'block',
      blockId: 'block-target',
      meeting: meeting('meeting-1'),
    }
  )

  assert.equal(result.ok, true)
  assert.equal(result.blocks[0].tasks[0].title, 'Edited locally')
  assert.equal(result.blocks[0].outlookEventId, 'outlook-keep')
  assert.equal(result.blocks[1].tasks[0].title, 'Unsaved title')
  assert.equal(result.blocks[1].meetings[0].id, 'meeting-1')
})

test('appending a task meeting keeps sibling tasks on the same block', () => {
  const result = appendProjectMeetingToBlocks(
    [
      {
        id: 'block-1',
        name: 'Bloc',
        summary: '',
        department: 'Serveis',
        departments: ['Serveis'],
        owner: 'Anna',
        deadline: '2026-10-01',
        budget: '',
        dependsOn: '',
        status: 'pending',
        tasks: [
          { id: 'task-keep', title: 'Keep me', owner: 'Anna', deadline: '2026-09-15', dependsOn: '', priority: 'normal', status: 'pending', outlookEventId: 'outlook-task' },
          { id: 'task-target', title: 'Target', owner: 'Berta', deadline: '2026-09-20', dependsOn: '', priority: 'normal', status: 'pending' },
        ],
      },
    ],
    {
      scope: 'task',
      blockId: 'block-1',
      taskId: 'task-target',
      meeting: meeting('meeting-task', { scope: 'task' }),
    }
  )

  assert.equal(result.ok, true)
  assert.equal(result.blocks[0].tasks[0].title, 'Keep me')
  assert.equal(result.blocks[0].tasks[0].outlookEventId, 'outlook-task')
  assert.equal(result.blocks[0].tasks[1].meetings[0].id, 'meeting-task')
})

test('appending a meeting does not drop existing convocatories', () => {
  const result = appendProjectMeetingToBlocks(
    [
      {
        id: 'block-1',
        name: 'Bloc',
        summary: '',
        department: 'Serveis',
        departments: ['Serveis'],
        owner: 'Anna',
        deadline: '2026-10-01',
        budget: '',
        dependsOn: '',
        status: 'pending',
        meetings: [meeting('meeting-old')],
        tasks: [],
      },
    ],
    {
      scope: 'block',
      blockId: 'block-1',
      meeting: meeting('meeting-new'),
    }
  )

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.blocks[0].meetings.map((item) => item.id),
    ['meeting-old', 'meeting-new']
  )
})

test('missing block or task does not wipe the snapshot', () => {
  const blocks = [
    {
      id: 'block-1',
      name: 'Bloc',
      summary: '',
      department: 'Serveis',
      departments: ['Serveis'],
      owner: 'Anna',
      deadline: '2026-10-01',
      budget: '',
      dependsOn: '',
      status: 'pending',
      tasks: [{ id: 'task-1', title: 'Tasca', owner: 'Anna', deadline: '2026-09-15', dependsOn: '', priority: 'normal', status: 'pending' }],
    },
  ]

  const missingBlock = appendProjectMeetingToBlocks(blocks, {
    scope: 'block',
    blockId: 'block-missing',
    meeting: meeting('meeting-1'),
  })
  assert.equal(missingBlock.ok, false)
  assert.equal(missingBlock.reason, 'block_not_found')

  const missingTask = appendProjectMeetingToBlocks(blocks, {
    scope: 'task',
    blockId: 'block-1',
    taskId: 'task-missing',
    meeting: meeting('meeting-1', { scope: 'task' }),
  })
  assert.equal(missingTask.ok, false)
  assert.equal(missingTask.reason, 'task_not_found')
})

test('meetings POST persists via transaction on the latest blocks snapshot', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const source = fs.readFileSync(
    path.join(__dirname, '../src/app/api/projects/[id]/meetings/route.ts'),
    'utf8'
  )
  assert.match(source, /appendProjectMeetingToBlocks/)
  assert.match(source, /runTransaction/)
  assert.match(source, /deleteOutlookCalendarEvent/)
  assert.doesNotMatch(
    source,
    /const nextBlocks = blocks\.map/
  )
})

test('client merges the new meeting into local blocks instead of replacing them', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const source = fs.readFileSync(
    path.join(__dirname, '../src/app/menu/projects/components/useProjectMeetings.ts'),
    'utf8'
  )
  assert.match(source, /appendProjectMeetingToBlocks\(current\.blocks/)
  assert.doesNotMatch(source, /blocks: response\.blocks/)
})
