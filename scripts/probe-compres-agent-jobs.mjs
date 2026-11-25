import fs from 'fs'

function loadEnv(path) {
  const raw = fs.readFileSync(path, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const envPath = 'D:/cal-blay-webapp/.env.local'
const env = loadEnv(envPath)
const url = (env.COMPRES_APP_URL || '').replace(/\/$/, '')
const key = env.COMPRES_AGENT_KEY || ''

console.log('calblapp COMPRES_APP_URL =', url || '(missing)')
console.log('calblapp COMPRES_AGENT_KEY length =', key.length)

if (!url || !key) {
  console.error('FAIL: missing COMPRES_* in calblapp .env.local')
  process.exit(1)
}

const headers = {
  'Content-Type': 'application/json',
  'x-compres-agent-key': key,
}

async function dump(label, res) {
  const text = await res.text()
  console.log(`\n=== ${label} ===`)
  console.log('status', res.status)
  console.log(text.slice(0, 1500))
  return text
}

// 1) List / inspect queue
const getRes = await fetch(`${url}/api/agent-jobs`, { headers })
await dump('GET /api/agent-jobs', getRes)

// 2) Enqueue a sales-opp job (same as Calendar Run)
const postRes = await fetch(`${url}/api/agent-jobs`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    kind: 'sales-opp-from-mail',
    params: { todayOnly: true, confirm: true },
  }),
})
const postText = await dump('POST /api/agent-jobs sales-opp-from-mail', postRes)

let jobId = null
try {
  jobId = JSON.parse(postText)?.job?.id || null
} catch {
  // ignore
}
console.log('\nEnqueued jobId =', jobId)

if (postRes.ok) {
  console.log('\nOK: calblapp key can enqueue on Compres Vercel.')
  console.log('If the PC worker is polling the same URL+key, it should claim this job now.')
} else {
  console.log('\nFAIL: enqueue rejected. Check COMPRES_AGENT_KEY on Compres Vercel vs calblapp.')
}
