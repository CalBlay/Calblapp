const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')

const {
  clearOrderDraft,
  clearOrderDraftMode,
  loadOrderDraft,
  loadOrderDraftMeta,
  loadOrderDraftMode,
  saveOrderDraft,
  saveOrderDraftMeta,
  saveOrderDraftMode,
} = require('../src/lib/eventComanda/orderDraft')

const originalWindow = global.window
const originalSessionStorage = global.sessionStorage

function installSessionStorage() {
  const store = new Map()
  const sessionStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(String(key))
    },
  }
  global.window = global
  global.sessionStorage = sessionStorage
  return store
}

function restoreGlobals() {
  if (originalWindow === undefined) delete global.window
  else global.window = originalWindow
  if (originalSessionStorage === undefined) delete global.sessionStorage
  else global.sessionStorage = originalSessionStorage
}

afterEach(restoreGlobals)

test('order draft helpers no-op without window (SSR)', () => {
  restoreGlobals()
  assert.deepEqual(loadOrderDraft('e1'), [])
  assert.equal(loadOrderDraftMode('e1'), null)
  assert.deepEqual(loadOrderDraftMeta('e1'), {})
  saveOrderDraft('e1', [{ articleCode: 'A', articleName: 'n', family: 'f', qtyTemplate: 1, qtyRequested: 1 }])
  saveOrderDraftMode('e1', 'scratch')
  saveOrderDraftMeta('e1', { comments: 'x' })
  clearOrderDraft('e1')
})

test('saveOrderDraft round-trips lines per event and drops empty drafts', () => {
  const store = installSessionStorage()
  const line = {
    articleCode: 'A1',
    articleName: 'Base',
    family: 'F',
    qtyTemplate: 2,
    qtyRequested: 3,
  }
  saveOrderDraft('evt-1', [line])
  saveOrderDraft('evt-2', [{ ...line, articleCode: 'B1' }])
  assert.deepEqual(loadOrderDraft('evt-1'), [line])
  assert.equal(loadOrderDraft('evt-2')[0].articleCode, 'B1')

  saveOrderDraft('evt-1', [])
  assert.equal(store.has('event-comanda-draft:evt-1'), false)
  assert.deepEqual(loadOrderDraft('evt-1'), [])
})

test('loadOrderDraft returns [] for invalid JSON or a non-array payload', () => {
  const store = installSessionStorage()
  store.set('event-comanda-draft:evt-1', '{not json')
  assert.deepEqual(loadOrderDraft('evt-1'), [])
  store.set('event-comanda-draft:evt-1', JSON.stringify({ articleCode: 'A' }))
  assert.deepEqual(loadOrderDraft('evt-1'), [])
})

test('draft mode only accepts template or scratch', () => {
  const store = installSessionStorage()
  saveOrderDraftMode('evt-1', 'template')
  assert.equal(loadOrderDraftMode('evt-1'), 'template')
  saveOrderDraftMode('evt-1', 'scratch')
  assert.equal(loadOrderDraftMode('evt-1'), 'scratch')

  store.set('event-comanda-draft-mode:evt-1', 'other')
  assert.equal(loadOrderDraftMode('evt-1'), null)
  clearOrderDraftMode('evt-1')
  assert.equal(store.has('event-comanda-draft-mode:evt-1'), false)
})

test('draft meta drops blank content and clearOrderDraft removes every key', () => {
  const store = installSessionStorage()
  saveOrderDraft('evt-1', [
    { articleCode: 'A', articleName: 'n', family: 'f', qtyTemplate: null, qtyRequested: 1 },
  ])
  saveOrderDraftMode('evt-1', 'scratch')
  saveOrderDraftMeta('evt-1', { deliveryDate: '2026-08-26', comments: '  ' })
  assert.deepEqual(loadOrderDraftMeta('evt-1'), {
    deliveryDate: '2026-08-26',
    comments: '  ',
  })

  saveOrderDraftMeta('evt-1', { deliveryDate: '  ', deliveryTimeSlot: '', comments: '' })
  assert.deepEqual(loadOrderDraftMeta('evt-1'), {})
  assert.equal(store.has('event-comanda-draft-meta:evt-1'), false)

  store.set('event-comanda-draft-meta:evt-1', '{bad')
  assert.deepEqual(loadOrderDraftMeta('evt-1'), {})

  saveOrderDraftMeta('evt-1', { comments: 'keep' })
  clearOrderDraft('evt-1')
  assert.equal(store.has('event-comanda-draft:evt-1'), false)
  assert.equal(store.has('event-comanda-draft-mode:evt-1'), false)
  assert.equal(store.has('event-comanda-draft-meta:evt-1'), false)
})
