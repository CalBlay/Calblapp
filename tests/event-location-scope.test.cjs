const test = require('node:test')
const assert = require('node:assert/strict')

const {
  eventLocationMatchesScope,
  resolveEventLocationScope,
} = require('../src/lib/events/eventLocationScope.ts')

test('restaurant account is scoped to the shared location name', () => {
  assert.equal(
    resolveEventLocationScope({
      userName: 'Restaurant Font de la Canya',
      role: 'treballador',
      department: 'Restauració',
    }),
    'Font de la Canya'
  )
})

test('the scope matches the same center across business-line prefixes', () => {
  const scope = 'Font de la Canya'
  assert.equal(eventLocationMatchesScope('Restaurant Font de la Canya', scope), true)
  assert.equal(eventLocationMatchesScope('Empresa FONT DE LA CANYA', scope), true)
  assert.equal(eventLocationMatchesScope('Casament Font de la Canya', scope), true)
  assert.equal(eventLocationMatchesScope('Font de la Canya', scope), true)
  assert.equal(eventLocationMatchesScope('Font de la Canya Nord', scope), false)
  assert.equal(eventLocationMatchesScope('Mirador', scope), false)
})

test('FDLC is an alias of Font de la Canya in either direction', () => {
  assert.equal(eventLocationMatchesScope('FDLC', 'Font de la Canya'), true)
  assert.equal(eventLocationMatchesScope('Empresa FDLC', 'Font de la Canya'), true)
  assert.equal(eventLocationMatchesScope('Font de la Canya', 'FDLC'), true)
  assert.equal(eventLocationMatchesScope('Casaments FDLC', 'Restaurant FDLC'), true)
})

test('the Casaments commercial venue name resolves to Font de la Canya', () => {
  assert.equal(
    eventLocationMatchesScope('Hotel Boutique Font de la Canya', 'Font de la Canya'),
    true
  )
  assert.equal(
    eventLocationMatchesScope('Hotel Boutique Font de la Canya', 'Restaurant FDLC'),
    true
  )
})

test('Restaurant Soliver is scoped to every real SesOliveres variant', () => {
  const scope = 'Soliver'
  assert.equal(eventLocationMatchesScope('SesOliveres', scope), true)
  assert.equal(eventLocationMatchesScope('Empresa SesOliveres', scope), true)
  assert.equal(eventLocationMatchesScope('Casaments SesOliveres', scope), true)
  assert.equal(eventLocationMatchesScope('Retaurant Soliver', scope), true)
  assert.equal(eventLocationMatchesScope('Ses Oliveres', 'Restaurant Soliver'), true)
  assert.equal(eventLocationMatchesScope('Solivella', scope), false)
})

test('ordinary workers are not scoped from their personal name', () => {
  assert.equal(
    resolveEventLocationScope({
      userName: 'Maria Font',
      role: 'treballador',
      department: 'Serveis',
    }),
    null
  )
})

test('external restaurant users can use the canonical center name without a prefix', () => {
  assert.equal(
    resolveEventLocationScope({
      userName: 'Font de la Canya',
      role: 'usuari',
      department: 'Restauració',
    }),
    'Font de la Canya'
  )
})
