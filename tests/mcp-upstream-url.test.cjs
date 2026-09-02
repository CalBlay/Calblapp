const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')

const { mcpUpstreamGet, mcpUpstreamPost } = require('../src/lib/server/mcpUpstreamFetch')

const originalFetch = global.fetch
const originalUrl = process.env.MCP_SERVER_URL
const originalKey = process.env.MCP_API_KEY

afterEach(() => {
  global.fetch = originalFetch
  if (originalUrl === undefined) delete process.env.MCP_SERVER_URL
  else process.env.MCP_SERVER_URL = originalUrl
  if (originalKey === undefined) delete process.env.MCP_API_KEY
  else process.env.MCP_API_KEY = originalKey
})

function jsonResponse(body, status = 200) {
  return {
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  }
}

test('mcpUpstreamGet returns 500 when URL or API key is missing and does not fetch', async () => {
  let fetched = 0
  global.fetch = async () => {
    fetched += 1
    return jsonResponse({ ok: true })
  }
  delete process.env.MCP_SERVER_URL
  process.env.MCP_API_KEY = 'secret'
  const missingUrl = await mcpUpstreamGet('/tools/get_events')
  assert.equal(missingUrl.status, 500)
  assert.match(String(missingUrl.body.error), /MCP_SERVER_URL|MCP_API_KEY/)

  process.env.MCP_SERVER_URL = 'https://mcp.example.com'
  delete process.env.MCP_API_KEY
  const missingKey = await mcpUpstreamGet('/tools/get_events')
  assert.equal(missingKey.status, 500)
  assert.equal(fetched, 0)
})

test('mcpUpstreamGet rejects non-https remote bases (SSRF / plaintext)', async () => {
  let fetched = 0
  global.fetch = async () => {
    fetched += 1
    return jsonResponse({ ok: true })
  }
  process.env.MCP_API_KEY = 'secret'
  process.env.MCP_SERVER_URL = 'http://evil.example.com'
  const blocked = await mcpUpstreamGet('/tools/get_events')
  assert.equal(blocked.status, 500)
  assert.match(String(blocked.body.error), /https/)
  assert.equal(fetched, 0)
})

test('mcpUpstreamGet allows https and local http, strips trailing slashes, and prefixes tool names', async () => {
  const seen = []
  global.fetch = async (url, init) => {
    seen.push({ url: String(url), key: init.headers['x-api-key'] })
    return jsonResponse({ ok: true, n: seen.length })
  }
  process.env.MCP_API_KEY = 'secret'
  process.env.MCP_SERVER_URL = 'https://mcp.example.com///'
  const remote = await mcpUpstreamGet('get_events', new URLSearchParams({ q: '1' }))
  assert.equal(remote.status, 200)
  assert.equal(remote.body.ok, true)
  assert.equal(seen[0].url, 'https://mcp.example.com/tools/get_events?q=1')
  assert.equal(seen[0].key, 'secret')

  process.env.MCP_SERVER_URL = 'http://127.0.0.1:8080/'
  const local = await mcpUpstreamGet('/chat/trace')
  assert.equal(local.status, 200)
  assert.equal(seen[1].url, 'http://127.0.0.1:8080/chat/trace')
})

test('mcpUpstreamGet maps fetch failures to 502 and non-JSON bodies to a safe error', async () => {
  process.env.MCP_API_KEY = 'secret'
  process.env.MCP_SERVER_URL = 'https://mcp.example.com'

  global.fetch = async () => {
    throw new Error('connect timeout')
  }
  const down = await mcpUpstreamGet('/tools/get_events')
  assert.equal(down.status, 502)
  assert.match(String(down.body.error), /connect timeout/)

  global.fetch = async () => ({
    status: 503,
    headers: { get: () => 'text/html' },
    text: async () => '<html>oops</html>',
  })
  const html = await mcpUpstreamGet('/tools/get_events')
  assert.equal(html.status, 503)
  assert.equal(html.body.error, 'Resposta MCP no JSON')
  assert.equal(html.body.upstreamStatus, 503)
})

test('mcpUpstreamPost uses the absolute path and the same allowlist as GET', async () => {
  const seen = []
  global.fetch = async (url, init) => {
    seen.push({ url: String(url), method: init.method, body: init.body })
    return jsonResponse({ ok: true })
  }
  process.env.MCP_API_KEY = 'secret'
  process.env.MCP_SERVER_URL = 'https://mcp.example.com'
  const ok = await mcpUpstreamPost('/chat', { prompt: 'hi' })
  assert.equal(ok.body.ok, true)
  assert.equal(seen[0].url, 'https://mcp.example.com/chat')
  assert.equal(seen[0].method, 'POST')
  assert.equal(JSON.parse(seen[0].body).prompt, 'hi')

  process.env.MCP_SERVER_URL = 'ftp://mcp.example.com'
  const blocked = await mcpUpstreamPost('/chat', {})
  assert.equal(blocked.status, 500)
  assert.equal(seen.length, 1)
})
