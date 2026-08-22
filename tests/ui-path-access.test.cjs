const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  matchingUiPaths,
  isUiPathBlocked,
  isUiPathAllowed,
} = require('../src/lib/uiPathAccess')

test('matchingUiPaths returns exact and ancestor catalog paths', () => {
  const uiMap = {
    '/menu': true,
    '/menu/manteniment': false,
    '/menu/manteniment/tickets': true,
    '/menu/spaces': true,
  }
  assert.deepEqual(
    matchingUiPaths('/menu/manteniment/tickets/123', uiMap).sort(),
    ['/menu', '/menu/manteniment', '/menu/manteniment/tickets'].sort()
  )
  assert.deepEqual(matchingUiPaths('', uiMap), [])
  assert.deepEqual(matchingUiPaths('/other', uiMap), [])
})

test('isUiPathBlocked uses the most specific matching path, not a denied parent', () => {
  const uiMap = {
    '/menu/manteniment': false,
    '/menu/manteniment/tickets': true,
  }
  assert.equal(isUiPathBlocked('/menu/manteniment', uiMap), true)
  assert.equal(isUiPathBlocked('/menu/manteniment/tickets', uiMap), false)
  assert.equal(isUiPathBlocked('/menu/manteniment/tickets/open', uiMap), false)
  assert.equal(isUiPathBlocked('/menu/unknown', uiMap), false)
})

test('isUiPathAllowed requires an explicit true match and keeps configuracio always open', () => {
  const uiMap = {
    '/menu/manteniment': true,
    '/menu/manteniment/tickets': false,
    '/menu/settings': true,
  }

  assert.equal(isUiPathAllowed('/menu/manteniment', uiMap), true)
  assert.equal(isUiPathAllowed('/menu/manteniment/tickets', uiMap), false)
  assert.equal(isUiPathAllowed('/menu/unknown', uiMap), false)
  assert.equal(isUiPathAllowed('', uiMap), false)

  assert.equal(isUiPathAllowed('/menu/configuracio', {}), true)
  assert.equal(isUiPathAllowed('/menu/configuracio/usuaris', { '/menu/configuracio': false }), true)

  assert.equal(isUiPathAllowed('/menu/settings/serveis', uiMap), true)
})

test('isUiPathAllowed falls back to settings parent when a more specific key is unset', () => {
  const uiMap = {
    '/menu/settings': true,
    '/menu/settings/serveis': undefined,
  }
  assert.equal(isUiPathAllowed('/menu/settings/serveis', uiMap), true)
  assert.equal(
    isUiPathAllowed('/menu/settings/serveis', {
      '/menu/settings': true,
      '/menu/settings/serveis': false,
    }),
    false
  )
})
