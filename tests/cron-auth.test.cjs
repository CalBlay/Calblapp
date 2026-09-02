const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')

const { requireCronAuth } = require('../src/lib/server/internalApiAuth')

const previous = {
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
}

function withEnv(updates, fn) {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return fn()
}

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function req(headers) {
  return new Request('https://example.test/api/sync/zoho-to-firestore', { headers })
}

test('requireCronAuth returns 503 when no secret is configured', async () => {
  await withEnv({ INTERNAL_API_SECRET: undefined, CRON_SECRET: undefined }, async () => {
    const res = requireCronAuth(req({ 'x-cron-secret': 'anything' }))
    assert.ok(res)
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'Cron secret not configured')
  })
})

test('requireCronAuth returns 401 for a mismatched secret', async () => {
  await withEnv({ INTERNAL_API_SECRET: 'expected-secret', CRON_SECRET: undefined }, async () => {
    const res = requireCronAuth(req({ 'x-internal-secret': 'wrong-secret' }))
    assert.ok(res)
    assert.equal(res.status, 401)
    const body = await res.json()
    assert.equal(body.error, 'Unauthorized cron')
  })
})

test('requireCronAuth accepts x-internal-secret, x-cron-secret, and Bearer', () => {
  withEnv({ INTERNAL_API_SECRET: ' configured-secret ', CRON_SECRET: undefined }, () => {
    assert.equal(requireCronAuth(req({ 'x-internal-secret': ' configured-secret ' })), null)
    assert.equal(requireCronAuth(req({ 'x-cron-secret': 'configured-secret' })), null)
    assert.equal(
      requireCronAuth(req({ authorization: 'Bearer configured-secret' })),
      null
    )
  })
})

test('requireCronAuth prefers INTERNAL_API_SECRET over CRON_SECRET', async () => {
  await withEnv(
    { INTERNAL_API_SECRET: 'internal-only', CRON_SECRET: 'cron-only' },
    async () => {
      assert.equal(requireCronAuth(req({ 'x-internal-secret': 'internal-only' })), null)
      const denied = requireCronAuth(req({ 'x-cron-secret': 'cron-only' }))
      assert.ok(denied)
      assert.equal(denied.status, 401)
    }
  )
})

test('requireCronAuth falls back to CRON_SECRET when INTERNAL_API_SECRET is unset', () => {
  withEnv({ INTERNAL_API_SECRET: undefined, CRON_SECRET: 'cron-secret' }, () => {
    assert.equal(requireCronAuth(req({ 'x-cron-secret': 'cron-secret' })), null)
    assert.equal(requireCronAuth(req({ 'x-internal-secret': 'cron-secret' })), null)
  })
})
