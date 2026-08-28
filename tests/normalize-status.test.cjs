const assert = require('node:assert/strict')
const { test } = require('node:test')

const { normalize, normalizeStatus } = require('../src/utils/normalize')

test('normalize folds accents, case, and extra spaces', () => {
  assert.equal(normalize('  Logística  Central  '), 'logistica central')
  assert.equal(normalize(''), '')
  assert.equal(normalize(undefined), '')
  assert.equal(normalize('   '), '')
})

test('normalizeStatus maps draft aliases including Catalan and Spanish', () => {
  for (const value of ['draft', 'Drafts', 'borrador', 'esborrany', ' esborranys ']) {
    assert.equal(normalizeStatus(value), 'draft', value)
  }
})

test('normalizeStatus maps pending aliases', () => {
  for (const value of ['pending', 'pendent', 'pendents', 'Pendiente']) {
    assert.equal(normalizeStatus(value), 'pending', value)
  }
})

test('normalizeStatus maps confirmed aliases', () => {
  for (const value of ['confirmed', 'confirmat', 'confirmats', 'confirmado', 'Confirmados']) {
    assert.equal(normalizeStatus(value), 'confirmed', value)
  }
})

test('normalizeStatus defaults unknown or empty values to pending', () => {
  assert.equal(normalizeStatus(undefined), 'pending')
  assert.equal(normalizeStatus(''), 'pending')
  assert.equal(normalizeStatus('cancelled'), 'pending')
  assert.equal(normalizeStatus('validat'), 'pending')
})
