const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  canConvokeBlockMeeting,
  canConvokeTaskMeeting,
  canConvokeProjectMeeting,
} = require('../src/lib/projectMeetingAccess')

const project = {
  owner: 'Patrícia Owner',
  ownerUserId: 'owner-1',
  sponsor: 'Sara Sponsor',
  createdById: 'creator-1',
  blocks: [
    {
      id: 'block-a',
      owner: 'Bloc Cap',
      tasks: [
        { id: 'task-1', owner: 'Tasca Owner', title: 'Disseny' },
        { id: 'task-2', owner: 'Altre', title: 'Compra' },
      ],
    },
  ],
}

const block = project.blocks[0]
const task = block.tasks[0]

test('canConvokeBlockMeeting allows admin, owner, creator, sponsor, and block owner', () => {
  assert.equal(canConvokeBlockMeeting({ role: 'admin', name: 'X' }, project, block), true)
  assert.equal(canConvokeBlockMeeting({ id: 'owner-1', name: 'Other' }, project, block), true)
  assert.equal(canConvokeBlockMeeting({ id: 'creator-1', name: 'Other' }, project, block), true)
  assert.equal(canConvokeBlockMeeting({ name: 'Patrícia Owner' }, project, block), true)
  assert.equal(canConvokeBlockMeeting({ name: 'Sara Sponsor' }, project, block), true)
  assert.equal(canConvokeBlockMeeting({ name: 'Bloc Cap' }, project, block), true)
})

test('canConvokeBlockMeeting denies task-only owners and unrelated users', () => {
  assert.equal(canConvokeBlockMeeting({ name: 'Tasca Owner' }, project, block), false)
  assert.equal(canConvokeBlockMeeting({ id: 'u9', name: 'Random', role: 'cap' }, project, block), false)
  assert.equal(canConvokeBlockMeeting({ name: '' }, project, block), false)
})

test('canConvokeTaskMeeting allows the task owner without granting block meetings', () => {
  assert.equal(canConvokeTaskMeeting({ name: 'Tasca Owner' }, project, block, task), true)
  assert.equal(canConvokeTaskMeeting({ name: 'Altre' }, project, block, task), false)
  assert.equal(canConvokeTaskMeeting({ name: 'Bloc Cap' }, project, block, task), true)
})

test('canConvokeProjectMeeting resolves block/task scope and missing ids', () => {
  assert.equal(
    canConvokeProjectMeeting({ name: 'Bloc Cap' }, project, 'block', 'block-a'),
    true
  )
  assert.equal(
    canConvokeProjectMeeting({ name: 'Tasca Owner' }, project, 'block', 'block-a'),
    false
  )
  assert.equal(
    canConvokeProjectMeeting({ name: 'Tasca Owner' }, project, 'task', 'block-a', 'task-1'),
    true
  )
  assert.equal(
    canConvokeProjectMeeting({ name: 'Tasca Owner' }, project, 'task', 'block-a', 'task-2'),
    false
  )
  assert.equal(
    canConvokeProjectMeeting({ name: 'Bloc Cap' }, project, 'block', 'missing'),
    false
  )
  assert.equal(
    canConvokeProjectMeeting({ name: 'Bloc Cap' }, project, 'task', 'block-a', 'missing'),
    false
  )
})
