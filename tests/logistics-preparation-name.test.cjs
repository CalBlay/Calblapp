const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

require('./register.cjs')

const { getPreparationEventName } = require('../src/lib/logistics/prepTypes')

test('preparation name overrides the shared event name only in preparation views', () => {
  assert.equal(
    getPreparationEventName({
      NomEvent: 'Nom general',
      PreparacioNomEvent: 'Nom intern de preparació',
    }),
    'Nom intern de preparació'
  )
})

test('preparation views fall back to the shared event name', () => {
  assert.equal(
    getPreparationEventName({ NomEvent: 'Nom general', PreparacioNomEvent: '' }),
    'Nom general'
  )
})

test('existing preparation rows never write their edited name to the shared NomEvent field', () => {
  const routePath = path.join(
    __dirname,
    '..',
    'src',
    'app',
    'api',
    'logistics',
    'update',
    'route.ts'
  )
  const source = fs.readFileSync(routePath, 'utf8')

  assert.match(source, /if \(item\.isNew\) \{\s*updateFields\.NomEvent = value/)
  assert.match(source, /else \{[\s\S]*?updateFields\.PreparacioNomEvent = value/)
})
