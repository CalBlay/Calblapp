/**
 * Proves de helpers de seguretat servidor (sense Firestore).
 * Executar: npm run test:server-security
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
  isPasswordHashed,
  preparePasswordForStorage,
  verifyPasswordWithMigration,
} from '../src/lib/server/passwords'
import { isAllowedSharePointFetchUrl } from '../src/lib/server/sharepointUrlAllowlist'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function assertCronStatus(req: Request, expectedStatus: number, message: string) {
  const response = requireCronAuth(req)
  assert(response !== null, `${message}: expected a response`)
  assert(response.status === expectedStatus, `${message}: expected ${expectedStatus}, got ${response.status}`)
}

function withInternalSecretEnv(fn: () => void) {
  const previousInternal = process.env.INTERNAL_API_SECRET
  const previousCron = process.env.CRON_SECRET
  try {
    fn()
  } finally {
    if (previousInternal === undefined) delete process.env.INTERNAL_API_SECRET
    else process.env.INTERNAL_API_SECRET = previousInternal

    if (previousCron === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousCron
  }
}

async function main() {
  withInternalSecretEnv(() => {
    process.env.INTERNAL_API_SECRET = '  primary-secret  '
    process.env.CRON_SECRET = 'fallback-secret'

    assert(getInternalApiSecret() === 'primary-secret', 'trims and prefers INTERNAL_API_SECRET')
    assert(
      readInternalSecretFromRequest(
        new Request('https://example.test', {
          headers: { authorization: 'Bearer primary-secret' },
        })
      ) === 'primary-secret',
      'reads bearer token'
    )
    assert(
      readInternalSecretFromRequest(
        new Request('https://example.test', {
          headers: { 'x-cron-secret': ' primary-secret ' },
        })
      ) === 'primary-secret',
      'reads trimmed cron header'
    )
    assert(
      isInternalApiAuthorized(
        new Request('https://example.test', {
          headers: { 'x-internal-secret': 'primary-secret' },
        })
      ),
      'accepts configured internal secret'
    )
    assert(
      !isInternalApiAuthorized(
        new Request('https://example.test', {
          headers: { 'x-internal-secret': 'wrong-secret' },
        })
      ),
      'rejects incorrect internal secret'
    )
    assert(
      internalApiHeaders()['x-internal-secret'] === 'primary-secret',
      'emits trimmed secret for internal calls'
    )
    assert(
      !('Content-Type' in internalApiHeaders('')),
      'can omit content type for internal calls with a stream body'
    )
  })

  withInternalSecretEnv(() => {
    delete process.env.INTERNAL_API_SECRET
    process.env.CRON_SECRET = 'cron-secret'
    assert(getInternalApiSecret() === 'cron-secret', 'falls back to CRON_SECRET')
    assert(
      requireCronAuth(
        new Request('https://example.test', {
          headers: { authorization: 'Bearer cron-secret' },
        })
      ) === null,
      'authorizes cron bearer token'
    )
  })

  await (async () => {
    const previousInternal = process.env.INTERNAL_API_SECRET
    const previousCron = process.env.CRON_SECRET
    try {
      delete process.env.INTERNAL_API_SECRET
      delete process.env.CRON_SECRET
      await assertCronStatus(
        new Request('https://example.test', {
          headers: { 'x-internal-secret': 'any-secret' },
        }),
        503,
        'cron auth without configured secret'
      )

      process.env.INTERNAL_API_SECRET = 'configured-secret'
      await assertCronStatus(
        new Request('https://example.test', {
          headers: { 'x-internal-secret': 'wrong-secret' },
        }),
        401,
        'cron auth with wrong secret'
      )
    } finally {
      if (previousInternal === undefined) delete process.env.INTERNAL_API_SECRET
      else process.env.INTERNAL_API_SECRET = previousInternal

      if (previousCron === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = previousCron
    }
  })()

  const previousDomain = process.env.SHAREPOINT_SITE_DOMAIN
  try {
    delete process.env.SHAREPOINT_SITE_DOMAIN
    assert(isAllowedSharePointFetchUrl('https://sharepoint.com/file.pdf'), 'allows sharepoint.com root')
    assert(
      isAllowedSharePointFetchUrl('https://tenant.sharepoint.com/sites/docs/file.pdf'),
      'allows SharePoint tenant subdomains'
    )
    assert(
      !isAllowedSharePointFetchUrl('http://tenant.sharepoint.com/sites/docs/file.pdf'),
      'rejects non-HTTPS SharePoint URLs'
    )
    assert(
      !isAllowedSharePointFetchUrl('https://sharepoint.com.evil.test/file.pdf'),
      'rejects suffix-smuggling hostnames'
    )
    assert(
      !isAllowedSharePointFetchUrl('https://sharepoint.com@evil.test/file.pdf'),
      'rejects userinfo host confusion'
    )
    assert(!isAllowedSharePointFetchUrl('not a url'), 'rejects malformed URLs')

    process.env.SHAREPOINT_SITE_DOMAIN = 'contoso.example.com'
    assert(
      isAllowedSharePointFetchUrl('https://docs.contoso.example.com/file.pdf'),
      'allows configured site domain subdomains'
    )
    assert(
      !isAllowedSharePointFetchUrl('https://contoso.example.com.evil.test/file.pdf'),
      'rejects configured-domain suffix smuggling'
    )
  } finally {
    if (previousDomain === undefined) delete process.env.SHAREPOINT_SITE_DOMAIN
    else process.env.SHAREPOINT_SITE_DOMAIN = previousDomain
  }

  const hashed = await preparePasswordForStorage(' legacy-password ')
  assert(typeof hashed === 'string' && isPasswordHashed(hashed), 'hashes plain password for storage')
  assert(await bcrypt.compare('legacy-password', hashed), 'stored hash verifies trimmed plain password')
  assert((await preparePasswordForStorage(hashed)) === hashed, 'preserves already-hashed password')

  const legacyResult = await verifyPasswordWithMigration(' legacy-password ', 'legacy-password')
  assert(legacyResult.ok, 'accepts legacy plain password match')
  assert(
    typeof legacyResult.rehash === 'string' && isPasswordHashed(legacyResult.rehash),
    'returns replacement hash for legacy plain password'
  )
  assert(
    await bcrypt.compare('legacy-password', legacyResult.rehash || ''),
    'replacement hash verifies original legacy password'
  )

  const hashedResult = await verifyPasswordWithMigration('legacy-password', hashed)
  assert(hashedResult.ok, 'accepts bcrypt password match')
  assert(!hashedResult.rehash, 'does not rehash an already-hashed password')

  const wrongResult = await verifyPasswordWithMigration('wrong-password', 'legacy-password')
  assert(!wrongResult.ok && !wrongResult.rehash, 'rejects wrong legacy password without rehash')
  assert((await preparePasswordForStorage('   ')) === undefined, 'ignores blank passwords for storage')

  console.log('server security helper tests OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
