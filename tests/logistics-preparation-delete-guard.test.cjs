const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  LOGISTICS_PREPARATION_SERVICES_COLLECTION,
  STAGE_VERD_COLLECTION,
  canDeleteLogisticsPreparationRow,
} = require('../src/lib/logistics/preparationDeleteGuard')

test('allows deleting logistics preparation service rows', () => {
  const result = canDeleteLogisticsPreparationRow({
    collectionName: LOGISTICS_PREPARATION_SERVICES_COLLECTION,
    id: 'svc-123',
    data: { ParentEventId: 'event-1' },
  })
  assert.equal(result.ok, true)
})

test('blocks deleting synced stage_verd event documents', () => {
  const result = canDeleteLogisticsPreparationRow({
    collectionName: STAGE_VERD_COLLECTION,
    id: 'zoho-deal-abc',
    data: {
      NomEvent: 'Casament',
      code: 'E123',
      StageGroup: 'Confirmat',
    },
  })
  assert.equal(result.ok, false)
  assert.match(String(result.error || ''), /esdeveniment confirmat/i)
})

test('allows deleting manual preparacio stage_verd stubs by id prefix', () => {
  const result = canDeleteLogisticsPreparationRow({
    collectionName: STAGE_VERD_COLLECTION,
    id: 'manual_1750000000_0',
    data: { NomEvent: 'Prova', origen: 'manual' },
  })
  assert.equal(result.ok, true)
})

test('allows deleting manual preparacio stage_verd stubs by origen', () => {
  const result = canDeleteLogisticsPreparationRow({
    collectionName: STAGE_VERD_COLLECTION,
    id: 'custom-manual-id',
    data: { origen: 'manual', NomEvent: 'Prova' },
  })
  assert.equal(result.ok, true)
})

test('rejects empty ids', () => {
  const result = canDeleteLogisticsPreparationRow({
    collectionName: LOGISTICS_PREPARATION_SERVICES_COLLECTION,
    id: '   ',
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'Falta ID')
})
