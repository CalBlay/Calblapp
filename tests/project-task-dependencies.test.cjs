const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  applyDependencyLocksToBlocks,
  canChangeTaskStatus,
  deriveProjectPhase,
  getTaskDependencyMeta,
  hasUnresolvedTaskDependency,
  normalizeTaskWorkflowStatus,
  resolveTaskStatusWithDependencies,
} = require('../src/app/menu/projects/components/project-shared')

const blocksWithDeps = [
  {
    id: 'b1',
    name: 'Kickoff',
    tasks: [
      { id: 't-setup', title: 'Setup', status: 'pending', dependsOn: '', owner: '' },
      { id: 't-wait', title: 'Wait', status: 'pending', dependsOn: 't-setup', owner: '' },
    ],
  },
]

test('normalizeTaskWorkflowStatus defaults blank values to pending', () => {
  assert.equal(normalizeTaskWorkflowStatus(null), 'pending')
  assert.equal(normalizeTaskWorkflowStatus('  DONE  '), 'done')
})

test('unresolved dependencies only allow blocked status changes', () => {
  const waiting = { dependsOn: 't-setup', status: 'pending' }
  assert.equal(hasUnresolvedTaskDependency(waiting, blocksWithDeps), true)
  assert.equal(canChangeTaskStatus(waiting, 'in_progress', blocksWithDeps), false)
  assert.equal(canChangeTaskStatus(waiting, 'done', blocksWithDeps), false)
  assert.equal(canChangeTaskStatus(waiting, 'blocked', blocksWithDeps), true)

  const resolvedBlocks = [
    {
      id: 'b1',
      name: 'Kickoff',
      tasks: [
        { id: 't-setup', title: 'Setup', status: 'done', dependsOn: '', owner: '' },
        { id: 't-wait', title: 'Wait', status: 'pending', dependsOn: 't-setup', owner: '' },
      ],
    },
  ]
  assert.equal(canChangeTaskStatus(waiting, 'in_progress', resolvedBlocks), true)
  assert.equal(getTaskDependencyMeta(resolvedBlocks, waiting).isResolved, true)
})

test('applyDependencyLocksToBlocks auto-blocks waiting tasks and unblocks when the parent is done', () => {
  const locked = applyDependencyLocksToBlocks(blocksWithDeps)
  assert.equal(locked[0].tasks[0].status, 'pending')
  assert.equal(locked[0].tasks[1].status, 'blocked')

  const afterDone = applyDependencyLocksToBlocks([
    {
      id: 'b1',
      name: 'Kickoff',
      tasks: [
        { id: 't-setup', title: 'Setup', status: 'done', dependsOn: '', owner: '' },
        { id: 't-wait', title: 'Wait', status: 'blocked', dependsOn: 't-setup', owner: '' },
      ],
    },
  ])
  assert.equal(afterDone[0].tasks[1].status, 'pending')

  const doneStaysDone = resolveTaskStatusWithDependencies(
    { id: 't-wait', title: 'Wait', status: 'done', dependsOn: 't-setup', owner: '' },
    blocksWithDeps
  )
  assert.equal(doneStaysDone.status, 'done')
})

test('deriveProjectPhase moves definition → kickoff → planning → execution', () => {
  assert.equal(deriveProjectPhase({ blocks: [], kickoff: {} }), 'definition')
  assert.equal(
    deriveProjectPhase({ blocks: [], kickoff: { status: 'scheduled' } }),
    'kickoff'
  )
  assert.equal(
    deriveProjectPhase({
      blocks: [{ id: 'b1', name: 'B', owner: '', tasks: [] }],
      kickoff: {},
    }),
    'planning'
  )
  assert.equal(
    deriveProjectPhase({
      blocks: [{ id: 'b1', name: 'B', owner: 'Anna', tasks: [] }],
      kickoff: {},
    }),
    'execution'
  )
  assert.equal(
    deriveProjectPhase({
      blocks: [{ id: 'b1', name: 'B', owner: '', tasks: [{ owner: 'Pep', status: 'pending' }] }],
      kickoff: {},
    }),
    'execution'
  )
})
