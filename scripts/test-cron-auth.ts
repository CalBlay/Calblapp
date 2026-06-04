/**
 * Executar: npx ts-node --transpile-only scripts/test-cron-auth.ts
 */
import { validateCronSecretRequest } from '../src/lib/server/cronAuth'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function request(headers?: HeadersInit) {
  return new Request('https://example.test/api/sync/zoho-to-firestore?mode=cron', {
    headers,
  })
}

async function main() {
  const previousSecret = process.env.CRON_SECRET

  try {
    delete process.env.CRON_SECRET
    const missingSecret = validateCronSecretRequest(request())
    assert(missingSecret?.status === 500, 'missing CRON_SECRET is rejected')

    process.env.CRON_SECRET = 'super-secret'

    const missingHeader = validateCronSecretRequest(request())
    assert(missingHeader?.status === 401, 'missing cron header is rejected')

    const wrongHeader = validateCronSecretRequest(
      request({ 'x-cron-secret': 'wrong-secret' })
    )
    assert(wrongHeader?.status === 401, 'wrong cron header is rejected')

    const xHeader = validateCronSecretRequest(
      request({ 'x-cron-secret': 'super-secret' })
    )
    assert(xHeader === null, 'valid x-cron-secret header is accepted')

    const bearerHeader = validateCronSecretRequest(
      request({ authorization: 'Bearer super-secret' })
    )
    assert(bearerHeader === null, 'valid bearer header is accepted')
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = previousSecret
    }
  }

  console.log('✅ cron auth tests OK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
