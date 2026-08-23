const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parseIsoDateKey,
  resolveDeliveryDateBounds,
  isDeliveryDateWithinBounds,
  getAvailableDeliverySlotsForDate,
  isDeliverySlotAvailableForDate,
  validateDeliveryDateAndSlot,
  normalizeDeliveryTimeSlot,
  isValidDeliveryDate,
  deliverySlotLabel,
  formatDeliveryDateLabel,
} = require('../src/lib/eventComanda/deliverySlots')

test('parseIsoDateKey accepts ISO date, datetime prefix, and day-first forms', () => {
  assert.equal(parseIsoDateKey('2026-08-23'), '2026-08-23')
  assert.equal(parseIsoDateKey('2026-08-23T13:45:00'), '2026-08-23')
  assert.equal(parseIsoDateKey('2026-08-23 09:00'), '2026-08-23')
  assert.equal(parseIsoDateKey('23/08/2026'), '2026-08-23')
  assert.equal(parseIsoDateKey('23-08-2026'), '2026-08-23')
  assert.equal(parseIsoDateKey('  2026-08-23  '), '2026-08-23')
})

test('parseIsoDateKey rejects empty and unparseable values', () => {
  assert.equal(parseIsoDateKey(''), null)
  assert.equal(parseIsoDateKey(null), null)
  assert.equal(parseIsoDateKey(undefined), null)
  assert.equal(parseIsoDateKey('not-a-date'), null)
})

test('isValidDeliveryDate requires a strict YYYY-MM-DD key', () => {
  assert.equal(isValidDeliveryDate('2026-08-23'), true)
  assert.equal(isValidDeliveryDate(' 2026-08-23 '), true)
  assert.equal(isValidDeliveryDate('23/08/2026'), false)
  assert.equal(isValidDeliveryDate('2026-08-23T10:00:00'), false)
  assert.equal(isValidDeliveryDate(''), false)
})

test('resolveDeliveryDateBounds clamps a past event end to today', () => {
  const now = new Date(2026, 7, 23, 10, 0, 0)
  assert.deepEqual(resolveDeliveryDateBounds('2026-08-28', now), {
    minDate: '2026-08-23',
    maxDate: '2026-08-28',
  })
  assert.deepEqual(resolveDeliveryDateBounds('2026-08-20', now), {
    minDate: '2026-08-23',
    maxDate: '2026-08-23',
  })
  assert.deepEqual(resolveDeliveryDateBounds(null, now), {
    minDate: '2026-08-23',
    maxDate: '2026-08-23',
  })
  assert.deepEqual(resolveDeliveryDateBounds('23/08/2026', now), {
    minDate: '2026-08-23',
    maxDate: '2026-08-23',
  })
})

test('isDeliveryDateWithinBounds uses parsed keys inclusive of min and max', () => {
  const bounds = { minDate: '2026-08-23', maxDate: '2026-08-25' }
  assert.equal(isDeliveryDateWithinBounds('2026-08-23', bounds), true)
  assert.equal(isDeliveryDateWithinBounds('2026-08-25', bounds), true)
  assert.equal(isDeliveryDateWithinBounds('2026-08-24T18:00:00', bounds), true)
  assert.equal(isDeliveryDateWithinBounds('2026-08-22', bounds), false)
  assert.equal(isDeliveryDateWithinBounds('2026-08-26', bounds), false)
  assert.equal(isDeliveryDateWithinBounds('', bounds), false)
})

test('getAvailableDeliverySlotsForDate hides elapsed slots only on today', () => {
  const now = new Date(2026, 7, 23, 13, 0, 0) // 13:00: mati ended at 12, migdia ends at 15
  assert.deepEqual(getAvailableDeliverySlotsForDate('2026-08-24', now), [
    'mati',
    'migdia',
    'tarda',
    'vespre',
  ])
  assert.deepEqual(getAvailableDeliverySlotsForDate('2026-08-23', now), [
    'migdia',
    'tarda',
    'vespre',
  ])

  const atNoon = new Date(2026, 7, 23, 12, 0, 0)
  assert.deepEqual(getAvailableDeliverySlotsForDate('2026-08-23', atNoon), [
    'migdia',
    'tarda',
    'vespre',
  ])
  assert.deepEqual(getAvailableDeliverySlotsForDate('not-a-date', now), [])
})

test('normalizeDeliveryTimeSlot and labels reject unknown franges', () => {
  assert.equal(normalizeDeliveryTimeSlot('Tarda'), 'tarda')
  assert.equal(normalizeDeliveryTimeSlot('  MIGDIA '), 'migdia')
  assert.equal(normalizeDeliveryTimeSlot('night'), null)
  assert.equal(normalizeDeliveryTimeSlot(''), null)
  assert.equal(deliverySlotLabel('vespre'), 'Vespre (18:00–21:00)')
  assert.equal(deliverySlotLabel('unknown'), '')
})

test('isDeliverySlotAvailableForDate rejects past-today and unknown slots', () => {
  const now = new Date(2026, 7, 23, 16, 0, 0) // tarda ends 18:00
  assert.equal(isDeliverySlotAvailableForDate('2026-08-23', 'tarda', now), true)
  assert.equal(isDeliverySlotAvailableForDate('2026-08-23', 'mati', now), false)
  assert.equal(isDeliverySlotAvailableForDate('2026-08-23', 'migdia', now), false)
  assert.equal(isDeliverySlotAvailableForDate('2026-08-24', 'mati', now), true)
  assert.equal(isDeliverySlotAvailableForDate('2026-08-23', 'nit', now), false)
})

test('validateDeliveryDateAndSlot returns the first blocking reason', () => {
  const now = new Date(2026, 7, 23, 13, 0, 0)
  const bounds = { minDate: '2026-08-23', maxDate: '2026-08-25' }

  assert.equal(
    validateDeliveryDateAndSlot({
      deliveryDate: '23/08/2026',
      deliveryTimeSlot: 'tarda',
      bounds,
      now,
    }),
    "Cal indicar un dia d'entrega vàlid."
  )
  assert.equal(
    validateDeliveryDateAndSlot({
      deliveryDate: '2026-08-26',
      deliveryTimeSlot: 'tarda',
      bounds,
      now,
    }),
    `La data d'entrega ha d'estar entre ${formatDeliveryDateLabel(bounds.minDate)} i ${formatDeliveryDateLabel(bounds.maxDate)}.`
  )
  assert.equal(
    validateDeliveryDateAndSlot({
      deliveryDate: '2026-08-24',
      deliveryTimeSlot: '',
      bounds,
      now,
    }),
    "Cal indicar la franja horària d'entrega."
  )
  assert.equal(
    validateDeliveryDateAndSlot({
      deliveryDate: '2026-08-23',
      deliveryTimeSlot: 'mati',
      bounds,
      now,
    }),
    'La franja horària seleccionada ja no està disponible per al dia escollit.'
  )
  assert.equal(
    validateDeliveryDateAndSlot({
      deliveryDate: '2026-08-23',
      deliveryTimeSlot: 'tarda',
      bounds,
      now,
    }),
    null
  )
})
