const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')

test('manual calendar sync requests a full Zoho sync', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/menu/calendar/page.tsx'),
    'utf8'
  )

  assert.match(
    source,
    /zoho-to-firestore\?mode=manual&includeAttachments=1&full=1/
  )
})

test('Zoho sync route keeps full sync opt-in', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/sync/zoho-to-firestore/route.ts'),
    'utf8'
  )

  assert.match(source, /searchParams\.get\('full'\) === '1'/)
  assert.match(source, /forceFullSync/)
})
