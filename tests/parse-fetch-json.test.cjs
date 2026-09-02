const assert = require('node:assert/strict')
const { test } = require('node:test')

const { parseFetchJson } = require('../src/lib/parseFetchJson')

function fakeResponse({ ok = true, text = '' } = {}) {
  return {
    ok,
    text: async () => text,
  }
}

test('parseFetchJson returns fallback when response is not ok', async () => {
  const fallback = { items: [] }
  const result = await parseFetchJson(fakeResponse({ ok: false, text: '{"items":[1]}' }), fallback)
  assert.equal(result, fallback)
})

test('parseFetchJson returns fallback for empty or whitespace bodies', async () => {
  const fallback = { ok: true }
  assert.equal(await parseFetchJson(fakeResponse({ text: '' }), fallback), fallback)
  assert.equal(await parseFetchJson(fakeResponse({ text: '   \n' }), fallback), fallback)
})

test('parseFetchJson parses valid JSON and falls back on invalid JSON', async () => {
  const parsed = await parseFetchJson(fakeResponse({ text: '  {"a":1}  ' }), { a: 0 })
  assert.deepEqual(parsed, { a: 1 })

  const fallback = { a: 0 }
  const bad = await parseFetchJson(fakeResponse({ text: '{not-json' }), fallback)
  assert.equal(bad, fallback)
})
