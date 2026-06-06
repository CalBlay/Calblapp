/**
 * Proves helpers de seguretat (sense Firebase ni serveis externs).
 * Executar: npm run test:security-helpers
 */
import bcrypt from 'bcryptjs'
import {
  getInternalApiSecret,
  internalApiHeaders,
  isInternalApiAuthorized,
  readInternalSecretFromRequest,
  requireCronAuth,
} from '../src/lib/server/internalApiAuth'
import {
  hashPassword,
  isPasswordHashed,
  preparePasswordForStorage,
  verifyPasswordWithMigration,
} from '../src/lib/server/passwords'
import { isAllowedSharePointFetchUrl } from '../src/lib/server/sharepointUrlAllowlist'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function makeRequest(headers: HeadersInit = {}) {
  return new Request('https://calblay.test/api/cron', { headers })
}

async function responseJson(res: Response | null) {
  assert(res !== null, 'expected a Response')
  return res.json() as Promise<Record<string, unknown>>
}

async function testPasswordHelpers() {
  assert(!isPasswordHashed('plain-secret'), 'plain text is not treated as bcrypt')

  const hashed = await hashPassword('  legacy-secret  ')
  assert(isPasswordHashed(hashed), 'hashPassword returns a bcrypt value')
  assert(await bcrypt.compare('legacy-secret', hashed), 'hashPassword trims before hashing')

  const hashedCheck = await verifyPasswordWithMigration('legacy-secret', hashed)
  assert(hashedCheck.ok, 'valid bcrypt password verifies')
  assert(!hashedCheck.rehash, 'valid bcrypt password is not rehashed')

  const wrongHashedCheck = await verifyPasswordWithMigration('wrong-secret', hashed)
  assert(!wrongHashedCheck.ok, 'invalid bcrypt password is rejected')
  assert(!wrongHashedCheck.rehash, 'invalid bcrypt password is not rehashed')

  const legacyCheck = await verifyPasswordWithMigration(' legacy-secret ', 'legacy-secret')
  assert(legacyCheck.ok, 'matching legacy plain text password verifies')
  assert(Boolean(legacyCheck.rehash), 'matching legacy password returns a migration hash')
  assert(
    legacyCheck.rehash !== 'legacy-secret' && isPasswordHashed(legacyCheck.rehash || ''),
    'legacy migration hash replaces plain text'
  )
  assert(
    await bcrypt.compare('legacy-secret', legacyCheck.rehash || ''),
    'legacy migration hash preserves the same password'
  )

  const wrongLegacyCheck = await verifyPasswordWithMigration('wrong-secret', 'legacy-secret')
  assert(!wrongLegacyCheck.ok, 'wrong legacy password is rejected')
  assert(!wrongLegacyCheck.rehash, 'wrong legacy password is not migrated')

  assert(await preparePasswordForStorage('') === undefined, 'blank password is omitted')
  assert(
    (await preparePasswordForStorage(` ${hashed} `)) === hashed,
    'pre-hashed password is preserved for storage'
  )

  const stored = await preparePasswordForStorage(' new-secret ')
  assert(Boolean(stored) && stored !== 'new-secret', 'plain password is hashed for storage')
  assert(await bcrypt.compare('new-secret', stored || ''), 'stored hash verifies')
}

async function testInternalApiAuth() {
  const originalInternal = process.env.INTERNAL_API_SECRET
  const originalCron = process.env.CRON_SECRET

  try {
    process.env.INTERNAL_API_SECRET = ' primary-secret '
    process.env.CRON_SECRET = 'fallback-secret'

    assert(getInternalApiSecret() === 'primary-secret', 'INTERNAL_API_SECRET takes precedence')
    assert(
      readInternalSecretFromRequest(makeRequest({ 'x-internal-secret': ' primary-secret ' })) ===
        'primary-secret',
      'reads x-internal-secret'
    )
    assert(
      readInternalSecretFromRequest(makeRequest({ 'x-cron-secret': ' fallback-secret ' })) ===
        'fallback-secret',
      'reads x-cron-secret fallback'
    )
    assert(
      readInternalSecretFromRequest(makeRequest({ authorization: 'Bearer primary-secret ' })) ===
        'primary-secret',
      'reads bearer token fallback'
    )
    assert(
      readInternalSecretFromRequest(makeRequest({ authorization: 'Basic primary-secret' })) === '',
      'ignores non-bearer authorization'
    )

    assert(
      isInternalApiAuthorized(makeRequest({ 'x-internal-secret': 'primary-secret' })),
      'matching internal secret authorizes request'
    )
    assert(
      !isInternalApiAuthorized(makeRequest({ 'x-internal-secret': 'wrong-secret' })),
      'wrong internal secret rejects request'
    )

    const unauthorized = requireCronAuth(makeRequest({ 'x-internal-secret': 'wrong-secret' }))
    assert(unauthorized?.status === 401, 'wrong cron secret returns 401')
    assert((await responseJson(unauthorized)).error === 'Unauthorized cron', '401 body is stable')

    const authorized = requireCronAuth(makeRequest({ authorization: 'Bearer primary-secret' }))
    assert(authorized === null, 'matching bearer cron secret passes')

    const headers = internalApiHeaders()
    assert(headers['Content-Type'] === 'application/json', 'default content type is included')
    assert(headers['x-internal-secret'] === 'primary-secret', 'internal secret header is included')

    const noContentType = internalApiHeaders('')
    assert(!('Content-Type' in noContentType), 'empty content type is omitted')

    delete process.env.INTERNAL_API_SECRET
    delete process.env.CRON_SECRET
    assert(getInternalApiSecret() === undefined, 'missing secrets are undefined')
    assert(
      !isInternalApiAuthorized(makeRequest({ 'x-internal-secret': 'primary-secret' })),
      'requests are rejected when no secret is configured'
    )

    const unavailable = requireCronAuth(makeRequest({ 'x-internal-secret': 'primary-secret' }))
    assert(unavailable?.status === 503, 'missing cron secret returns 503')
    assert(
      (await responseJson(unavailable)).error === 'Cron secret not configured',
      '503 body is stable'
    )
  } finally {
    if (originalInternal === undefined) delete process.env.INTERNAL_API_SECRET
    else process.env.INTERNAL_API_SECRET = originalInternal
    if (originalCron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalCron
  }
}

function testSharePointAllowlist() {
  const originalDomain = process.env.SHAREPOINT_SITE_DOMAIN

  try {
    delete process.env.SHAREPOINT_SITE_DOMAIN

    assert(
      isAllowedSharePointFetchUrl('https://tenant.sharepoint.com/sites/documents/file.pdf'),
      'allows SharePoint tenant HTTPS URLs'
    )
    assert(isAllowedSharePointFetchUrl('https://sharepoint.com/path'), 'allows root SharePoint host')
    assert(
      !isAllowedSharePointFetchUrl('http://tenant.sharepoint.com/sites/documents/file.pdf'),
      'rejects non-HTTPS SharePoint URLs'
    )
    assert(
      !isAllowedSharePointFetchUrl('https://tenant.sharepoint.com.evil.test/file.pdf'),
      'rejects SharePoint lookalike hosts'
    )
    assert(!isAllowedSharePointFetchUrl('not a url'), 'rejects invalid URLs')

    process.env.SHAREPOINT_SITE_DOMAIN = ' calblay.sharepoint.com '
    assert(
      isAllowedSharePointFetchUrl('https://calblay.sharepoint.com/sites/documents/file.pdf'),
      'allows configured SharePoint domain'
    )
    assert(
      isAllowedSharePointFetchUrl('https://subsite.calblay.sharepoint.com/file.pdf'),
      'allows configured SharePoint subdomains'
    )
  } finally {
    if (originalDomain === undefined) delete process.env.SHAREPOINT_SITE_DOMAIN
    else process.env.SHAREPOINT_SITE_DOMAIN = originalDomain
  }
}

async function main() {
  await testPasswordHelpers()
  await testInternalApiAuth()
  testSharePointAllowlist()
  console.log('✅ security helper tests OK')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
