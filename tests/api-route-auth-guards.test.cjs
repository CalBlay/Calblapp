const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const ROOT = path.join(__dirname, '..')

/** Routes that previously had no session gate and expose Graph/Admin SDK power. */
const AUTH_REQUIRED_ROUTES = [
  'src/app/api/sharepoint/browse/route.ts',
  'src/app/api/sharepoint/file/route.ts',
  'src/app/api/finques/[id]/route.ts',
  'src/app/api/fincas/[id]/route.ts',
  'src/app/api/transports/route.ts',
  'src/app/api/transports/[id]/route.ts',
  'src/app/api/transports/available/route.ts',
  'src/app/api/transports/assignacions/route.ts',
]

function readRoute(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
}

function exportedHandlers(source) {
  const handlers = []
  for (const match of source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    handlers.push(match[1])
  }
  return handlers
}

function handlerBody(source, method) {
  const re = new RegExp(
    `export\\s+async\\s+function\\s+${method}\\b[\\s\\S]*?(?=export\\s+async\\s+function\\s+(?:GET|POST|PUT|PATCH|DELETE)\\b|$)`
  )
  const match = source.match(re)
  assert.ok(match, `expected exported ${method} handler`)
  return match[0]
}

test('critical data routes import requireAuth from apiAuth', () => {
  for (const relPath of AUTH_REQUIRED_ROUTES) {
    const source = readRoute(relPath)
    assert.match(
      source,
      /import\s+\{\s*requireAuth\s*\}\s+from\s+['"]@\/lib\/server\/apiAuth['"]/,
      `${relPath} must import requireAuth`
    )
  }
})

test('each handler on critical data routes gates with requireAuth before work', () => {
  for (const relPath of AUTH_REQUIRED_ROUTES) {
    const source = readRoute(relPath)
    for (const method of exportedHandlers(source)) {
      const body = handlerBody(source, method)
      assert.match(
        body,
        /const\s+auth\s*=\s*await\s+requireAuth\s*\(\s*\)/,
        `${relPath} ${method} must await requireAuth()`
      )
      assert.match(
        body,
        /if\s*\(\s*!auth\.ok\s*\)\s*return\s+auth\.res/,
        `${relPath} ${method} must return auth.res on failure`
      )

      const authIdx = body.indexOf('await requireAuth()')
      const sensitiveMarkers = [
        'listChildren(',
        'createAnonymousViewLink(',
        'getGraphToken(',
        'firestoreAdmin',
        'db.collection',
      ]
      for (const marker of sensitiveMarkers) {
        const markerIdx = body.indexOf(marker)
        if (markerIdx === -1) continue
        assert.ok(
          authIdx !== -1 && authIdx < markerIdx,
          `${relPath} ${method}: requireAuth must run before ${marker}`
        )
      }
    }
  }
})

test('GET /api/modifications requires a session before listing or enriching stage_verd', () => {
  const source = readRoute('src/app/api/modifications/route.ts')
  assert.match(
    source,
    /import\s+\{\s*requireAuth\s*\}\s+from\s+['"]@\/lib\/server\/apiAuth['"]/,
    'modifications list must import requireAuth'
  )
  const get = handlerBody(source, 'GET')
  assert.match(get, /const\s+auth\s*=\s*await\s+requireAuth\s*\(\s*\)/)
  assert.match(get, /if\s*\(\s*!auth\.ok\s*\)\s*return\s+auth\.res/)

  const authIdx = get.indexOf('await requireAuth()')
  for (const marker of ['firestoreAdmin', 'collection("modifications")', 'collection("stage_verd")']) {
    const markerIdx = get.indexOf(marker)
    if (markerIdx === -1) continue
    assert.ok(
      authIdx !== -1 && authIdx < markerIdx,
      `GET /api/modifications: requireAuth must run before ${marker}`
    )
  }
})

test('sharepoint browse POST still creates anonymous Graph links only after auth', () => {
  const source = readRoute('src/app/api/sharepoint/browse/route.ts')
  const post = handlerBody(source, 'POST')
  assert.match(post, /createAnonymousViewLink\s*\(/)
  assert.ok(post.indexOf('await requireAuth()') < post.indexOf('createAnonymousViewLink('))
})
