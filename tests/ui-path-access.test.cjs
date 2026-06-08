const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isUiPathAllowed,
  isUiPathBlocked,
  matchingUiPaths,
} = require('../src/lib/uiPathAccess')

test('UI path access resolves the most specific matching permission path', () => {
  const uiMap = {
    '/menu/logistica': false,
    '/menu/logistica/preparacio': true,
    '/menu/logistica/assignacions': false,
  }

  assert.deepEqual(matchingUiPaths('/menu/logistica/preparacio/event-1', uiMap), [
    '/menu/logistica',
    '/menu/logistica/preparacio',
  ])
  assert.equal(isUiPathAllowed('/menu/logistica/preparacio/event-1', uiMap), true)
  assert.equal(isUiPathBlocked('/menu/logistica/preparacio/event-1', uiMap), false)
  assert.equal(isUiPathAllowed('/menu/logistica/assignacions/event-1', uiMap), false)
  assert.equal(isUiPathBlocked('/menu/logistica/assignacions/event-1', uiMap), true)
})

test('UI path access treats configuration URLs as always allowed', () => {
  const uiMap = {
    '/menu/configuracio': false,
    '/menu/configuracio/permisos': false,
  }

  assert.equal(isUiPathAllowed('/menu/configuracio', uiMap), true)
  assert.equal(isUiPathAllowed('/menu/configuracio/permisos', uiMap), true)
})

test('UI path access rejects empty and unmatched URLs by default', () => {
  assert.deepEqual(matchingUiPaths('   ', { '/menu/logistica': true }), [])
  assert.equal(isUiPathAllowed('', { '/menu/logistica': true }), false)
  assert.equal(isUiPathBlocked('', { '/menu/logistica': true }), false)
  assert.equal(isUiPathAllowed('/menu/unknown', { '/menu/logistica': true }), false)
  assert.equal(isUiPathBlocked('/menu/unknown', { '/menu/logistica': true }), false)
})
