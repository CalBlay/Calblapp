const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  collectServeisNamesFromDeals,
  planNewServeisCreates,
} = require('../src/services/zoho/sync-serveis-names')

const slugify = (text) =>
  String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

test('collectServeisNamesFromDeals prefers Servicio_texto and falls back to Men_texto', () => {
  const names = collectServeisNamesFromDeals([
    { Servicio_texto: '  Cocktail  ', Men_texto: 'ignored' },
    { Men_texto: 'Sopar' },
    { Servicio_texto: 'Cocktail' },
    { Servicio_texto: '   ', Men_texto: '' },
  ])

  assert.deepEqual(names.sort(), ['Cocktail', 'Sopar'].sort())
})

test('planNewServeisCreates skips existing norms and empty slugify results', () => {
  const planned = planNewServeisCreates({
    names: ['Cocktail', 'Sopar Gala', '???', 'Cocktail'],
    existingNorms: ['cocktail'],
    slugify,
  })

  assert.deepEqual(planned, [
    {
      nomRaw: 'Sopar Gala',
      norm: 'sopar-gala',
      searchable: 'sopar gala sopar-gala',
    },
  ])
})
