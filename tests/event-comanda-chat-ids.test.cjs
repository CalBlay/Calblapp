const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildEventComandaChannelId,
  buildEventComandaRoomId,
  defaultChannelIdForBatch,
  eventComandaBatchIdentity,
  parseEventComandaRoomId,
  resolveEventComandaBatchChannelId,
} = require('../src/lib/messaging/eventComandaChatIds')

test('buildEventComandaChannelId omits batchId when it matches the warehouse', () => {
  assert.equal(buildEventComandaChannelId('', 'MAG'), '')
  assert.equal(buildEventComandaChannelId('evt-1', ''), '')
  assert.equal(
    buildEventComandaChannelId('evt-1', ' mag-1 '),
    'event_comanda_evt-1_MAG1'
  )
  assert.equal(
    buildEventComandaChannelId('evt-1', 'MAG', 'MAG'),
    'event_comanda_evt-1_MAG'
  )
  assert.equal(
    buildEventComandaChannelId('evt-1', 'MAG', 'rev-2'),
    'event_comanda_evt-1_MAG_rev-2'
  )
})

test('default and stored channel ids keep revision lots distinct from the primary warehouse chat', () => {
  const primary = {
    warehouseId: 'MAG',
    warehouseCode: 'MAG',
    warehouseName: 'Magatzem',
    batchId: 'MAG',
    kind: 'primary',
    status: 'pending',
    lines: [],
  }
  const revision = {
    ...primary,
    batchId: 'rev-9',
    kind: 'revision',
    opsChannelId: 'event_comanda_evt-1_MAG_rev-9',
  }

  assert.equal(eventComandaBatchIdentity(primary), 'MAG')
  assert.equal(defaultChannelIdForBatch('evt-1', primary), 'event_comanda_evt-1_MAG')
  assert.equal(
    defaultChannelIdForBatch('evt-1', { ...revision, opsChannelId: null }),
    'event_comanda_evt-1_MAG_rev-9'
  )
  assert.equal(resolveEventComandaBatchChannelId('evt-1', revision), revision.opsChannelId)
  assert.equal(
    resolveEventComandaBatchChannelId('evt-1', { ...revision, opsChannelId: '  ' }),
    'event_comanda_evt-1_MAG_rev-9'
  )
})

test('parseEventComandaRoomId splits warehouse/batch and rejects incomplete ids', () => {
  assert.deepEqual(parseEventComandaRoomId('comanda-MAG__rev-9'), {
    warehouseId: 'MAG',
    batchId: 'rev-9',
  })
  assert.deepEqual(parseEventComandaRoomId('comanda-MAG'), {
    warehouseId: 'MAG',
    batchId: null,
  })
  assert.equal(parseEventComandaRoomId('other-MAG__x'), null)
  assert.equal(parseEventComandaRoomId('comanda-__rev'), null)
  assert.equal(parseEventComandaRoomId('comanda-MAG__'), null)
  assert.equal(buildEventComandaRoomId(' mag ', 'rev-9'), 'comanda-MAG__rev-9')
})
