const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildFincaMatcher,
  hasRestaurantKeyword,
  normalizeLocationKey,
} = require('../src/services/zoho/sync-finca-matching')

function makeDoc(id, data) {
  return {
    id,
    data: () => data,
  }
}

function identityCode(raw) {
  const value = String(raw || '').trim().toUpperCase()
  return value || null
}

test('normalizeLocationKey strips parentheticals, accents, and generic business words', () => {
  // Parenthetical removal also consumes surrounding spaces, so put the
  // removable keyword after the paren to avoid gluing words together.
  assert.equal(
    normalizeLocationKey('Can Blay Restaurant (Casament)'),
    'can blay'
  )
  assert.equal(normalizeLocationKey('  Masía  Empúries  '), 'masia empuries')
  assert.equal(normalizeLocationKey('Empresa Cal Blay Grups'), 'cal blay')
  // Documents current glue behavior when a paren eats the following space.
  assert.equal(
    normalizeLocationKey('Can Blay (Casament) Restaurant'),
    'can blayrestaurant'
  )
})
test('hasRestaurantKeyword matches common and typo restaurant spellings', () => {
  assert.equal(hasRestaurantKeyword('Grups Restaurants'), true)
  assert.equal(hasRestaurantKeyword('Restaurante La Plaça'), true)
  assert.equal(hasRestaurantKeyword('Restuarnat Cal Blay'), true)
  assert.equal(hasRestaurantKeyword('Casament Masia'), false)
})

test('buildFincaMatcher prefers Zoho code hits and uses LN to disambiguate names', () => {
  const findFinca = buildFincaMatcher({
    docs: [
      makeDoc('CCB01', {
        code: 'CCB01',
        nom: 'Can Blay',
        ln: 'Casaments',
      }),
      makeDoc('CCR02', {
        code: 'CCR02',
        nom: 'Can Blay',
        ln: 'Grups Restaurants',
      }),
      makeDoc('CCE10', {
        code: 'CCE10',
        nom: 'Mas Emporium',
        ln: 'Empresa',
      }),
    ],
    normalizeSyncedCode: identityCode,
    normalizeIncomingZohoCode: identityCode,
    extractCodeFromName: (raw) => {
      const match = String(raw || '').match(/\b(CC[A-Z]\d+)\b/i)
      return match ? match[1].toUpperCase() : null
    },
    isBadCode: () => false,
  })

  assert.equal(findFinca(['Event CCB01 · Sala']).code, 'CCB01')
  assert.equal(findFinca(['Can Blay'], 'Casament').code, 'CCB01')
  assert.equal(findFinca(['Can Blay'], 'Grups Restaurants').code, 'CCR02')
  assert.equal(findFinca(['Mas Emporium (Empresa)'], 'Empresa').code, 'CCE10')
  assert.equal(findFinca([null, '', '   ']), null)
})

test('buildFincaMatcher fuzzy-matches near names above the similarity threshold', () => {
  const findFinca = buildFincaMatcher({
    docs: [
      makeDoc('CCF20', {
        code: 'CCF20',
        nom: 'Mas Emporium',
        ln: 'Empresa',
      }),
    ],
    normalizeSyncedCode: identityCode,
    normalizeIncomingZohoCode: identityCode,
    extractCodeFromName: () => null,
    isBadCode: () => false,
  })

  // One-character edit distance on a long name should still match (>= 0.9).
  const hit = findFinca(['Mas Emporiun'], 'Empresa')
  assert.ok(hit)
  assert.equal(hit.code, 'CCF20')

  assert.equal(findFinca(['Totally Different Venue'], 'Empresa'), null)
})
