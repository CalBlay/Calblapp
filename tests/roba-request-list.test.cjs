const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildRobaOperationalSummary,
  isOpenRobaRequestStatus,
} = require('../src/app/menu/roba-personal/robaRequestList')
const {
  getRobaOperationalNextAction,
  getRobaRequestExperience,
} = require('../src/app/menu/roba-personal/robaRequestExperience')

test('open roba requests remain visible outside the selected history period', () => {
  for (const status of [
    'submitted',
    'sent_to_rrhh',
    'prepared',
    'ready_for_worker_delivery',
    'picked_up',
  ]) {
    assert.equal(isOpenRobaRequestStatus(status), true, status)
  }
})

test('closed roba requests still respect the selected history period', () => {
  for (const status of ['fulfilled', 'receipt_confirmed', 'cancelled', 'rejected', '']) {
    assert.equal(isOpenRobaRequestStatus(status), false, status)
  }
})

test('operational summary counts each actionable workflow stage in one view', () => {
  assert.deepEqual(
    buildRobaOperationalSummary(
      [
        { status: 'submitted' },
        { status: 'sent_to_rrhh' },
        { status: 'prepared' },
        { status: 'ready_for_worker_delivery' },
        { status: 'picked_up' },
        { status: 'receipt_confirmed' },
      ],
      [
        { workerReceiptCorrectionOpen: true },
        { workerReceiptCorrectionOpen: false },
      ]
    ),
    {
      submitted: 1,
      sentToRrhh: 1,
      prepared: 1,
      readyForDelivery: 2,
      disputes: 1,
    }
  )
})

test('worker request experience explains the next action consistently', () => {
  assert.deepEqual(
    ['submitted', 'sent_to_rrhh', 'prepared', 'picked_up', 'receipt_confirmed'].map(
      (status) => getRobaRequestExperience(status).step
    ),
    [1, 2, 3, 3, 4]
  )
  assert.equal(getRobaRequestExperience('receipt_confirmed').closed, true)
  assert.equal(getRobaRequestExperience('cancelled').step, 0)
  assert.match(getRobaRequestExperience('fulfilled').nextAction, /confirma/i)
})

test('operational queue names the concrete next action', () => {
  assert.equal(getRobaOperationalNextAction('submitted'), 'Revisar i enviar a RRHH')
  assert.equal(getRobaOperationalNextAction('sent_to_rrhh'), 'Preparar el material')
  assert.equal(getRobaOperationalNextAction('prepared'), 'Validar la recollida')
  assert.match(getRobaOperationalNextAction('picked_up'), /entrega/i)
})
