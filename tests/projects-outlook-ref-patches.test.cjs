const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  applyOutlookRefPatches,
  collectOutlookRefPatches,
} = require('../src/lib/projects/outlookRefPatches')

test('collects only blocks/tasks whose Outlook refs changed', () => {
  const previous = [
    {
      id: 'block-1',
      name: 'Muntatge',
      outlookEventId: 'evt-old',
      outlookEventEmail: 'anna@calblay.com',
      tasks: [
        {
          id: 'task-1',
          title: 'Comprar',
          outlookEventId: 'task-evt-old',
          outlookEventEmail: 'anna@calblay.com',
        },
        { id: 'task-2', title: 'Pintar' },
      ],
    },
  ]
  const next = [
    {
      id: 'block-1',
      name: 'Muntatge actualitzat',
      outlookEventId: 'evt-new',
      outlookEventWebLink: 'https://outlook.example/evt-new',
      outlookEventEmail: 'anna@calblay.com',
      tasks: [
        {
          id: 'task-1',
          title: 'Comprar',
          outlookEventId: 'task-evt-old',
          outlookEventEmail: 'anna@calblay.com',
        },
        {
          id: 'task-2',
          title: 'Pintar',
          outlookEventId: 'task-evt-2',
          outlookEventEmail: 'joan@calblay.com',
        },
      ],
    },
  ]

  const patches = collectOutlookRefPatches(previous, next)
  assert.equal(patches.length, 2)
  assert.deepEqual(patches[0], {
    blockId: 'block-1',
    refs: {
      outlookEventId: 'evt-new',
      outlookEventWebLink: 'https://outlook.example/evt-new',
      outlookEventEmail: 'anna@calblay.com',
    },
  })
  assert.deepEqual(patches[1], {
    blockId: 'block-1',
    taskId: 'task-2',
    refs: {
      outlookEventId: 'task-evt-2',
      outlookEventWebLink: '',
      outlookEventEmail: 'joan@calblay.com',
    },
  })
})

test('stale after() snapshot does not wipe tasks added by a later save', () => {
  const staleSnapshotFromFirstSave = [
    {
      id: 'block-1',
      name: 'Muntatge',
      owner: 'Anna',
      outlookEventId: 'evt-1',
      outlookEventWebLink: 'https://outlook.example/evt-1',
      outlookEventEmail: 'anna@calblay.com',
      tasks: [{ id: 'task-1', title: 'Comprar', owner: 'Anna' }],
    },
  ]
  const latestAfterSecondSave = [
    {
      id: 'block-1',
      name: 'Muntatge',
      owner: 'Anna',
      tasks: [
        { id: 'task-1', title: 'Comprar', owner: 'Anna' },
        { id: 'task-2', title: 'Nova tasca afegida despres', owner: 'Joan', cost: '120' },
      ],
    },
    {
      id: 'block-2',
      name: 'Bloc nou',
      owner: 'Marta',
      tasks: [],
    },
  ]

  const patches = collectOutlookRefPatches(
    [{ id: 'block-1', name: 'Muntatge', owner: 'Anna', tasks: [{ id: 'task-1', title: 'Comprar' }] }],
    staleSnapshotFromFirstSave
  )
  const merged = applyOutlookRefPatches(latestAfterSecondSave, patches)

  assert.equal(merged.length, 2)
  assert.equal(merged[0].outlookEventId, 'evt-1')
  assert.equal(merged[0].outlookEventEmail, 'anna@calblay.com')
  assert.equal(merged[0].tasks.length, 2)
  assert.equal(merged[0].tasks[1].title, 'Nova tasca afegida despres')
  assert.equal(merged[0].tasks[1].cost, '120')
  assert.equal(merged[1].name, 'Bloc nou')
})

test('does not resurrect blocks/tasks removed by a later save', () => {
  const patches = collectOutlookRefPatches(
    [{ id: 'block-gone', tasks: [{ id: 'task-gone' }] }],
    [
      {
        id: 'block-gone',
        outlookEventId: 'evt-gone',
        outlookEventEmail: 'anna@calblay.com',
        tasks: [
          {
            id: 'task-gone',
            outlookEventId: 'task-evt-gone',
            outlookEventEmail: 'anna@calblay.com',
          },
        ],
      },
    ]
  )

  const merged = applyOutlookRefPatches(
    [{ id: 'block-kept', name: 'Encara existeix', tasks: [{ id: 'task-kept', title: 'Keep' }] }],
    patches
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'block-kept')
  assert.equal(merged[0].outlookEventId, undefined)
  assert.equal(merged[0].tasks.length, 1)
  assert.equal(merged[0].tasks[0].id, 'task-kept')
})

test('clears Outlook refs when a deadline is removed', () => {
  const patches = collectOutlookRefPatches(
    [
      {
        id: 'block-1',
        outlookEventId: 'evt-1',
        outlookEventEmail: 'anna@calblay.com',
        tasks: [
          {
            id: 'task-1',
            outlookEventId: 'task-evt-1',
            outlookEventEmail: 'anna@calblay.com',
          },
        ],
      },
    ],
    [
      {
        id: 'block-1',
        outlookEventId: '',
        outlookEventWebLink: '',
        outlookEventEmail: '',
        tasks: [
          {
            id: 'task-1',
            outlookEventId: '',
            outlookEventWebLink: '',
            outlookEventEmail: '',
          },
        ],
      },
    ]
  )

  const merged = applyOutlookRefPatches(
    [
      {
        id: 'block-1',
        name: 'Muntatge',
        outlookEventId: 'evt-1',
        outlookEventEmail: 'anna@calblay.com',
        tasks: [
          {
            id: 'task-1',
            title: 'Comprar',
            outlookEventId: 'task-evt-1',
            outlookEventEmail: 'anna@calblay.com',
          },
        ],
      },
    ],
    patches
  )

  assert.equal(merged[0].outlookEventId, '')
  assert.equal(merged[0].outlookEventEmail, '')
  assert.equal(merged[0].name, 'Muntatge')
  assert.equal(merged[0].tasks[0].outlookEventId, '')
  assert.equal(merged[0].tasks[0].title, 'Comprar')
})
