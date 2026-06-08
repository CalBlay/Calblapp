const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildPreparationUpdateFields,
} = require('../src/lib/logistics/preparationUpdate')

test('logistics preparation update accepts trimmed ISO date and time fields', () => {
  assert.deepEqual(
    buildPreparationUpdateFields({
      preparacioData: ' 2026-06-06 ',
      preparacioHora: ' 09:30 ',
    }),
    {
      ok: true,
      fields: {
        PreparacioData: '2026-06-06',
        PreparacioHora: '09:30',
      },
    }
  )
})

test('logistics preparation update permits single-field updates', () => {
  assert.deepEqual(buildPreparationUpdateFields({ preparacioData: '2026-12-31' }), {
    ok: true,
    fields: { PreparacioData: '2026-12-31' },
  })

  assert.deepEqual(buildPreparationUpdateFields({ preparacioHora: '23:59' }), {
    ok: true,
    fields: { PreparacioHora: '23:59' },
  })
})

test('logistics preparation update rejects malformed or empty payloads', () => {
  assert.deepEqual(buildPreparationUpdateFields({}), {
    ok: false,
    error: 'No fields to update',
  })
  assert.deepEqual(buildPreparationUpdateFields({ preparacioData: '06/06/2026' }), {
    ok: false,
    error: 'PreparacioData invalida',
  })
  assert.deepEqual(buildPreparationUpdateFields({ preparacioData: '' }), {
    ok: false,
    error: 'PreparacioData invalida',
  })
  assert.deepEqual(buildPreparationUpdateFields({ preparacioHora: '24:00' }), {
    ok: false,
    error: 'PreparacioHora invalida',
  })
  assert.deepEqual(buildPreparationUpdateFields({ preparacioHora: '9:30' }), {
    ok: false,
    error: 'PreparacioHora invalida',
  })
})
