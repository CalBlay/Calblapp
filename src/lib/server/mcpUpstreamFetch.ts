/**
 * Crides HTTP al servei MCP (Cloud Run) des de routes Next.js.
 * Centralitza timeout, validació d’URL i errors quan la resposta no és JSON.
 */

const MCP_TIMEOUT_MS = 25_000
const MCP_CHAT_TIMEOUT_MS = 120_000

function normalizeMcpBase(raw: string): string {
  return raw.trim().replace(/\/$/, '')
}

export async function mcpUpstreamGet(
  toolPath: string,
  searchParams?: URLSearchParams
): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = normalizeMcpBase(process.env.MCP_SERVER_URL || '')
  const apiKey = (process.env.MCP_API_KEY || '').trim()

  if (!base || !apiKey) {
    return {
      status: 500,
      body: { ok: false, error: 'Falten MCP_SERVER_URL o MCP_API_KEY al servidor' },
    }
  }

  if (!base.startsWith('https://')) {
    return {
      status: 500,
      body: {
        ok: false,
        error: 'MCP_SERVER_URL ha de ser una URL https (ex. https://….run.app)',
      },
    }
  }

  const path = toolPath.startsWith('/') ? toolPath : `/tools/${toolPath}`
  const target = new URL(`${base}${path}`)
  if (searchParams) {
    searchParams.forEach((value, key) => {
      target.searchParams.set(key, value)
    })
  }

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconegut'
    return {
      status: 502,
      body: {
        ok: false,
        error: `No s’ha pogut contactar el MCP: ${msg}`,
        hint:
          'Revisa a Vercel (Environment Variables) que MCP_SERVER_URL apunti al Cloud Run correcte i que el servei estigui actiu. Després, Redeploy.',
      },
    }
  }

  const text = await upstream.text()
  const contentType = upstream.headers.get('content-type')
  let host = ''
  try {
    host = new URL(base).host
  } catch {
    host = '(MCP_SERVER_URL invàlida)'
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return { status: upstream.status, body: parsed }
  } catch {
    console.warn('[mcp-proxy] Resposta upstream no és JSON', {
      status: upstream.status,
      contentType,
      host,
      snippet: text.slice(0, 240).replace(/\s+/g, ' '),
    })

    return {
      status: upstream.status,
      body: {
        ok: false,
        error: 'Resposta MCP no JSON',
        hint:
          'El MCP ha retornat HTML o text (sovint URL malament, clau incorrecta, o error de Cloud Run). Comprova MCP_SERVER_URL i MCP_API_KEY a Vercel i torna a desplegar.',
        upstreamStatus: upstream.status,
        contentType,
        raw: text.slice(0, 800),
      },
    }
  }
}

export async function mcpUpstreamPost(
  absolutePath: string,
  jsonBody: Record<string, unknown>,
  options?: { timeoutMs?: number }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const base = normalizeMcpBase(process.env.MCP_SERVER_URL || '')
  const apiKey = (process.env.MCP_API_KEY || '').trim()

  if (!base || !apiKey) {
    return {
      status: 500,
      body: { ok: false, error: 'Falten MCP_SERVER_URL o MCP_API_KEY al servidor' },
    }
  }

  if (!base.startsWith('https://')) {
    return {
      status: 500,
      body: {
        ok: false,
        error: 'MCP_SERVER_URL ha de ser una URL https (ex. https://….run.app)',
      },
    }
  }

  const path = absolutePath.startsWith('/') ? absolutePath : `/${absolutePath}`
  const target = new URL(`${base}${path}`)
  const timeoutMs = options?.timeoutMs ?? MCP_CHAT_TIMEOUT_MS

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jsonBody),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconegut'
    return {
      status: 502,
      body: {
        ok: false,
        error: `No s’ha pogut contactar el MCP: ${msg}`,
        hint:
          'Revisa MCP_SERVER_URL i MCP_API_KEY a Vercel. El xat pot trigar més que les consultes GET; si cal, torna a provar.',
      },
    }
  }

  const text = await upstream.text()
  const contentType = upstream.headers.get('content-type')
  let host = ''
  try {
    host = new URL(base).host
  } catch {
    host = '(MCP_SERVER_URL invàlida)'
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return { status: upstream.status, body: parsed }
  } catch {
    console.warn('[mcp-proxy] Resposta POST upstream no és JSON', {
      status: upstream.status,
      contentType,
      host,
      snippet: text.slice(0, 240).replace(/\s+/g, ' '),
    })

    return {
      status: upstream.status,
      body: {
        ok: false,
        error: 'Resposta MCP no JSON',
        hint:
          'El MCP ha retornat HTML o text. Comprova MCP_SERVER_URL, MCP_API_KEY i que el servei tingui el endpoint /chat desplegat.',
        upstreamStatus: upstream.status,
        contentType,
        raw: text.slice(0, 800),
      },
    }
  }
}
