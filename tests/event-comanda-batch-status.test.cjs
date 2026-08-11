const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeEventComandaBatchStatus,
  normalizeEventComandaOrderBatches,
  deriveOrderStatusFromBatches,
  isComandaWarehouseChatActive,
} = require('../src/lib/eventComanda/batchStatus')

test('normalizeEventComandaBatchStatus maps done→ready and unknown→pending', () => {
  assert.equal(normalizeEventComandaBatchStatus('done'), 'ready')
  assert.equal(normalizeEventComandaBatchStatus('ready'), 'ready')
  assert.equal(normalizeEventComandaBatchStatus('in_progress'), 'in_progress')
  assert.equal(normalizeEventComandaBatchStatus(''), 'pending')
  assert.equal(normalizeEventComandaBatchStatus(null), 'pending')
  assert.equal(normalizeEventComandaBatchStatus('weird'), 'pending')
})

test('normalizeEventComandaOrderBatches fills ids, coerces kind, and nulls bad qty', () => {
  assert.equal(normalizeEventComandaOrderBatches(undefined), undefined)
  assert.deepEqual(normalizeEventComandaOrderBatches([]), [])

  const [normalized] = normalizeEventComandaOrderBatches([
    {
      warehouseId: 'wh-1',
      kind: 'other',
      status: 'done',
      lines: [
        { articleId: 'a1', qtyPrepared: Number.NaN, qtyRequestedBefore: undefined },
        { articleId: 'a2', qtyPrepared: 3, qtyRequestedBefore: 2, modifiedAt: 't1' },
      ],
    },
  ])

  assert.equal(normalized.batchId, 'wh-1')
  assert.equal(normalized.kind, 'primary')
  assert.equal(normalized.status, 'ready')
  assert.equal(normalized.lines[0].qtyPrepared, null)
  assert.equal(normalized.lines[0].qtyRequestedBefore, null)
  assert.equal(normalized.lines[1].qtyPrepared, 3)
  assert.equal(normalized.lines[1].qtyRequestedBefore, 2)
  assert.equal(normalized.lines[1].modifiedAt, 't1')
})

test('normalizeEventComandaOrderBatches keeps revision kind and batch_N fallback id', () => {
  const [normalized] = normalizeEventComandaOrderBatches([
    {
      kind: 'revision',
      status: 'pending',
      lines: [],
    },
  ])
  assert.equal(normalized.batchId, 'batch_0')
  assert.equal(normalized.kind, 'revision')
})

test('deriveOrderStatusFromBatches derives sent/in_progress/closed from active lots', () => {
  assert.equal(deriveOrderStatusFromBatches([]), 'sent')
  assert.equal(
    deriveOrderStatusFromBatches([{ status: 'cancelled' }, { status: 'cancelled' }]),
    'closed'
  )
  assert.equal(
    deriveOrderStatusFromBatches([{ status: 'ready' }, { status: 'sent' }]),
    'closed'
  )
  assert.equal(
    deriveOrderStatusFromBatches([
      { status: 'pending' },
      { status: 'cancelled' },
    ]),
    'sent'
  )
  assert.equal(
    deriveOrderStatusFromBatches([
      { status: 'pending' },
      { status: 'in_progress' },
    ]),
    'in_progress'
  )
  assert.equal(
    deriveOrderStatusFromBatches([
      { status: 'pending' },
      { status: 'ready' },
    ]),
    'in_progress'
  )
  assert.equal(
    deriveOrderStatusFromBatches([{ status: 'done' }, { status: 'sent' }]),
    'closed'
  )
})

test('isComandaWarehouseChatActive stays open until sent or cancelled', () => {
  assert.equal(isComandaWarehouseChatActive('pending'), true)
  assert.equal(isComandaWarehouseChatActive('in_progress'), true)
  assert.equal(isComandaWarehouseChatActive('issue'), true)
  assert.equal(isComandaWarehouseChatActive('ready'), true)
  assert.equal(isComandaWarehouseChatActive('done'), true)
  assert.equal(isComandaWarehouseChatActive('sent'), false)
  assert.equal(isComandaWarehouseChatActive('cancelled'), false)
})
