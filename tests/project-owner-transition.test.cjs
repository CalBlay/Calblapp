const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  resolveProjectOwnerTransition,
  collectRemovedProjectAssignmentTargets,
  collectProjectOutlookCalendarEvents,
} = require('../src/lib/projects/ownerTransition')

test('unassigning a block or task owner must notify removal, not assignment', () => {
  const transition = resolveProjectOwnerTransition({
    previousOwnerName: 'Maria',
    nextOwnerName: '',
  })

  assert.equal(transition.shouldNotifyRemoval, true)
  assert.equal(transition.shouldNotifyAssignment, false)
})

test('the empty-owner early return used before desfer skipped unassign cleanup', () => {
  const blockOwner = ''
  const previousOwnerName = 'Maria'
  const legacySkipped = !blockOwner || blockOwner === previousOwnerName
  const transition = resolveProjectOwnerTransition({
    previousOwnerName,
    nextOwnerName: blockOwner,
  })

  assert.equal(legacySkipped, true)
  assert.equal(transition.shouldNotifyRemoval, true)
})

test('draft/publish still re-notifies assignment without treating same owner as a removal', () => {
  const transition = resolveProjectOwnerTransition({
    previousOwnerName: 'Maria',
    nextOwnerName: 'Maria',
    treatAsNewAssignment: true,
  })

  assert.equal(transition.shouldNotifyRemoval, false)
  assert.equal(transition.shouldNotifyAssignment, true)
})

test('draft owner change still removes the previous daily Outlook series', () => {
  const transition = resolveProjectOwnerTransition({
    previousOwnerName: 'Maria',
    nextOwnerName: 'Pere',
    treatAsNewAssignment: true,
  })

  assert.equal(transition.shouldNotifyRemoval, true)
  assert.equal(transition.shouldNotifyAssignment, true)
})

test('unchanged published owners do not notify', () => {
  const transition = resolveProjectOwnerTransition({
    previousOwnerName: 'Maria',
    nextOwnerName: 'Maria',
  })

  assert.equal(transition.shouldNotifyRemoval, false)
  assert.equal(transition.shouldNotifyAssignment, false)
})

test('deleting a block collects the block owner and nested task owners', () => {
  const targets = collectRemovedProjectAssignmentTargets({
    previousBlocks: [
      {
        id: 'block-1',
        name: 'Muntatge',
        owner: 'Maria',
        outlookEventId: 'evt-block',
        outlookEventEmail: 'maria@calblay.com',
        tasks: [
          {
            id: 'task-1',
            title: 'Comprar',
            owner: 'Pere',
            outlookEventId: 'evt-task',
            outlookEventEmail: 'pere@calblay.com',
          },
        ],
      },
    ],
    nextBlocks: [],
  })

  assert.equal(targets.length, 2)
  assert.equal(targets[0].kind, 'block')
  assert.equal(targets[0].previousOwnerName, 'Maria')
  assert.equal(targets[0].outlookEventId, 'evt-block')
  assert.equal(targets[1].kind, 'task')
  assert.equal(targets[1].previousOwnerName, 'Pere')
  assert.equal(targets[1].outlookEventId, 'evt-task')
})

test('deleting a task from a kept block collects only that task', () => {
  const targets = collectRemovedProjectAssignmentTargets({
    previousBlocks: [
      {
        id: 'block-1',
        name: 'Muntatge',
        owner: 'Maria',
        tasks: [
          { id: 'task-1', title: 'Comprar', owner: 'Pere', outlookEventId: 'evt-task' },
          { id: 'task-2', title: 'Revisar', owner: 'Joan' },
        ],
      },
    ],
    nextBlocks: [
      {
        id: 'block-1',
        name: 'Muntatge',
        owner: 'Maria',
        tasks: [{ id: 'task-2', title: 'Revisar', owner: 'Joan' }],
      },
    ],
  })

  assert.equal(targets.length, 1)
  assert.equal(targets[0].taskId, 'task-1')
  assert.equal(targets[0].previousOwnerName, 'Pere')
})

test('unassigning in place is not treated as a removed row', () => {
  const targets = collectRemovedProjectAssignmentTargets({
    previousBlocks: [
      {
        id: 'block-1',
        owner: 'Maria',
        outlookEventId: 'evt-block',
        tasks: [{ id: 'task-1', owner: 'Pere', outlookEventId: 'evt-task' }],
      },
    ],
    nextBlocks: [
      {
        id: 'block-1',
        owner: '',
        tasks: [{ id: 'task-1', owner: '' }],
      },
    ],
  })

  assert.equal(targets.length, 0)
})

test('project delete collects unique Outlook events from blocks and tasks', () => {
  const events = collectProjectOutlookCalendarEvents([
    {
      outlookEventId: 'evt-block',
      outlookEventEmail: 'maria@calblay.com',
      tasks: [
        { outlookEventId: 'evt-task', outlookEventEmail: 'pere@calblay.com' },
        { outlookEventId: 'evt-block', outlookEventEmail: 'maria@calblay.com' },
      ],
    },
  ])

  assert.deepEqual(events, [
    { email: 'maria@calblay.com', eventId: 'evt-block' },
    { email: 'pere@calblay.com', eventId: 'evt-task' },
  ])
})
