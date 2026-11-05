const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  reconcileActiveZohoDealCancellation,
} = require('../src/lib/calendar/zohoCancellation')

test('reactivates cancellations created from a missing Zoho snapshot', () => {
  const result = reconcileActiveZohoDealCancellation(
    { Stage: 'Cerrada ganada', NomEvent: 'Event' },
    {
      cancelled: true,
      cancelledAt: '2026-11-05T09:24:00.000Z',
      cancelledByName: 'Zoho',
      cancellationSource: 'zoho-record-missing',
      cancellationNoticeSentAt: '2026-11-05T10:00:00.000Z',
    }
  )

  assert.equal(result.cancelled, false)
  assert.equal(result.cancelledAt, null)
  assert.equal(result.cancelledByName, null)
  assert.equal(result.cancellationSource, null)
  assert.equal(result.cancellationNoticeSentAt, null)
})

test('reactivates a lost-stage cancellation when Zoho sends the deal as active again', () => {
  const result = reconcileActiveZohoDealCancellation(
    { Stage: 'RQ' },
    { cancelled: true, cancellationSource: 'zoho-stage-lost' }
  )

  assert.equal(result.cancelled, false)
  assert.equal(result.cancellationSource, null)
})

test('preserves manual cancellation metadata from the latest document', () => {
  const result = reconcileActiveZohoDealCancellation(
    { Stage: 'Cerrada ganada', cancelled: false },
    {
      cancelled: true,
      cancelledAt: '2026-11-05T11:00:00.000Z',
      cancelledByUserId: 'user-1',
      cancelledByName: 'Usuari',
      cancellationSource: 'manual',
    }
  )

  assert.equal(result.cancelled, true)
  assert.equal(result.cancelledAt, '2026-11-05T11:00:00.000Z')
  assert.equal(result.cancelledByUserId, 'user-1')
  assert.equal(result.cancelledByName, 'Usuari')
  assert.equal(result.cancellationSource, 'manual')
})

test('preserves legacy manual cancellations without a source', () => {
  const result = reconcileActiveZohoDealCancellation(
    { Stage: 'Cerrada ganada' },
    { cancelled: true, cancelledByName: 'Usuari antic' }
  )

  assert.equal(result.cancelled, true)
  assert.equal(result.cancelledByName, 'Usuari antic')
})
