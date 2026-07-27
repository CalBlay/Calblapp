const assert = require('node:assert/strict')
const { test } = require('node:test')
const bcrypt = require('bcryptjs')

const {
  isAllowedSharePointFetchUrl,
} = require('../src/lib/server/sharepointUrlAllowlist')
const {
  getInternalApiSecret,
  internalApiHeaders,
  isInternalApiAuthorized,
  readInternalSecretFromRequest,
} = require('../src/lib/server/internalApiAuth')
const {
  isPasswordHashed,
  preparePasswordForStorage,
  verifyPasswordWithMigration,
} = require('../src/lib/server/passwords')
const {
  pickSelfProfileUpdate,
  serializeUserResponse,
  stripPassword,
} = require('../src/lib/server/userApiSerialization')

function withEnv(updates, fn) {
  const previous = {}
  for (const key of Object.keys(updates)) {
    previous[key] = process.env[key]
    const value = updates[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('SharePoint URL allowlist only accepts https SharePoint hosts', () => {
  withEnv({ SHAREPOINT_SITE_DOMAIN: undefined }, () => {
    assert.equal(
      isAllowedSharePointFetchUrl('https://calblay.sharepoint.com/sites/menu/file.pdf'),
      true
    )
    assert.equal(
      isAllowedSharePointFetchUrl('https://sharepoint.com/public/file.pdf'),
      true
    )
    assert.equal(
      isAllowedSharePointFetchUrl('http://calblay.sharepoint.com/sites/menu/file.pdf'),
      false
    )
    assert.equal(
      isAllowedSharePointFetchUrl('https://calblay.sharepoint.com.evil.test/file.pdf'),
      false
    )
    assert.equal(isAllowedSharePointFetchUrl('not a url'), false)
  })
})

test('SharePoint URL allowlist honors configured tenant domains safely', () => {
  withEnv({ SHAREPOINT_SITE_DOMAIN: 'CalBlay.SharePoint.com ' }, () => {
    assert.equal(
      isAllowedSharePointFetchUrl('https://calblay.sharepoint.com/sites/menu/file.pdf'),
      true
    )
    assert.equal(
      isAllowedSharePointFetchUrl('https://assets.calblay.sharepoint.com/file.pdf'),
      true
    )
    assert.equal(
      isAllowedSharePointFetchUrl('https://calblay.sharepoint.com.evil.test/file.pdf'),
      false
    )
  })
})

test('internal API auth rejects missing configuration and accepts supported secret carriers', () => {
  withEnv({ INTERNAL_API_SECRET: undefined, CRON_SECRET: undefined }, () => {
    const req = new Request('https://example.test/api/push/send', {
      headers: { 'x-internal-secret': 'configured-secret' },
    })
    assert.equal(getInternalApiSecret(), undefined)
    assert.equal(isInternalApiAuthorized(req), false)
  })

  withEnv({ INTERNAL_API_SECRET: ' configured-secret ', CRON_SECRET: undefined }, () => {
    assert.equal(getInternalApiSecret(), 'configured-secret')
    assert.equal(
      isInternalApiAuthorized(
        new Request('https://example.test/api/push/send', {
          headers: { 'x-internal-secret': ' configured-secret ' },
        })
      ),
      true
    )
    assert.equal(
      isInternalApiAuthorized(
        new Request('https://example.test/api/push/send', {
          headers: { authorization: 'Bearer configured-secret' },
        })
      ),
      true
    )
    assert.equal(
      isInternalApiAuthorized(
        new Request('https://example.test/api/push/send', {
          headers: {
            authorization: 'Bearer configured-secret',
            'x-internal-secret': 'wrong-secret',
          },
        })
      ),
      false
    )
    assert.deepEqual(internalApiHeaders(), {
      'Content-Type': 'application/json',
      'x-internal-secret': 'configured-secret',
    })
  })

  withEnv({ INTERNAL_API_SECRET: undefined, CRON_SECRET: 'cron-secret' }, () => {
    const req = new Request('https://example.test/api/cleanup', {
      headers: { 'x-cron-secret': 'cron-secret' },
    })
    assert.equal(readInternalSecretFromRequest(req), 'cron-secret')
    assert.equal(isInternalApiAuthorized(req), true)
  })
})

test('password helpers verify bcrypt values and accept matching plaintext without rehash', async () => {
  const bcryptHash = await bcrypt.hash('legacy-secret', 4)

  assert.equal(isPasswordHashed(` ${bcryptHash} `), true)
  assert.equal(isPasswordHashed('legacy-secret'), false)

  assert.deepEqual(await verifyPasswordWithMigration('legacy-secret', bcryptHash), {
    ok: true,
  })
  assert.deepEqual(await verifyPasswordWithMigration('wrong-secret', bcryptHash), {
    ok: false,
  })

  // Current storage keeps plaintext for admin visibility; bcrypt hashes still verify.
  assert.deepEqual(await verifyPasswordWithMigration(' legacy-secret ', 'legacy-secret'), {
    ok: true,
  })
  assert.deepEqual(await verifyPasswordWithMigration('legacy-secret', 'different'), {
    ok: false,
  })
})

test('password storage helper preserves hashes, stores plaintext, and ignores blank input', async () => {
  const existingHash = await bcrypt.hash('already-hashed', 4)

  assert.equal(await preparePasswordForStorage('   '), undefined)
  assert.equal(await preparePasswordForStorage(existingHash), existingHash)

  const prepared = await preparePasswordForStorage(' new-secret ')
  assert.equal(prepared, 'new-secret')
  assert.equal(isPasswordHashed(prepared), false)
})
test('user API serializers strip passwords and limit self-profile updates', () => {
  assert.deepEqual(stripPassword({ name: 'Ada', password: 'secret', role: 'admin' }), {
    name: 'Ada',
    role: 'admin',
  })

  assert.deepEqual(
    serializeUserResponse('user-1', {
      name: 'Ada',
      email: 'ada@example.test',
      password: 'secret',
    }),
    {
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.test',
    }
  )

  assert.deepEqual(
    serializeUserResponse(
      'user-1',
      { name: 'Ada', password: 'secret' },
      { department: 'Ops', password: 'extra-secret' }
    ),
    {
      id: 'user-1',
      name: 'Ada',
      department: 'Ops',
    }
  )

  assert.deepEqual(
    pickSelfProfileUpdate(
      {
        name: 'Ada Lovelace',
        nameFold: 'ada lovelace',
        email: undefined,
        phone: '555-0100',
        password: 'new-secret',
        role: 'admin',
        department: 'Finance',
        canRespondSurveys: true,
      },
      123456
    ),
    {
      updatedAt: 123456,
      name: 'Ada Lovelace',
      nameFold: 'ada lovelace',
      phone: '555-0100',
      password: 'new-secret',
    }
  )
})
