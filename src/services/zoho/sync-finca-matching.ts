function normalizeTextForMatch(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function normalizeLocationKey(raw: string): string {
  return String(raw || '')
    .replace(/\s*\([^)]+\)\s*/g, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(
      /\b(empresa|empreses|casament|casaments|restaurant|restaurants|grup|grups)\b/g,
      ' '
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLocationCompactKey(raw: string): string {
  return normalizeLocationKey(raw).replace(/\s+/g, '')
}

function normalizeLnBucket(raw?: string | null): string {
  const normalized = normalizeTextForMatch(raw || '')
  if (!normalized) return ''
  if (normalized.includes('casament')) return 'casaments'
  if (normalized.includes('empresa')) return 'empresa'
  if (
    normalized.includes('restaurant') ||
    normalized.includes('grups restaurant')
  ) {
    return 'grups restaurants'
  }
  return normalized
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length

  const rows = b.length + 1
  const cols = a.length + 1
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))

  for (let i = 0; i < rows; i += 1) dp[i][0] = i
  for (let j = 0; j < cols; j += 1) dp[0][j] = j

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[b.length][a.length]
}

function nameSimilarity(a: string, b: string): number {
  const left = normalizeLocationKey(a)
  const right = normalizeLocationKey(b)
  if (!left || !right) return 0
  if (left === right) return 1

  const leftCompact = left.replace(/\s+/g, '')
  const rightCompact = right.replace(/\s+/g, '')
  if (leftCompact && leftCompact === rightCompact) return 1

  const maxLen = Math.max(left.length, right.length)
  if (maxLen === 0) return 1

  const dist = levenshteinDistance(left, right)
  const spacedScore = 1 - dist / maxLen
  const compactMaxLen = Math.max(leftCompact.length, rightCompact.length)
  const compactScore =
    compactMaxLen > 0
      ? 1 - levenshteinDistance(leftCompact, rightCompact) / compactMaxLen
      : 1

  return Math.max(spacedScore, compactScore)
}

export function hasRestaurantKeyword(raw: string): boolean {
  const normalized = normalizeTextForMatch(raw)
  return (
    normalized.includes('restaurant') ||
    normalized.includes('restaurante') ||
    normalized.includes('restuarnat') ||
    normalized.includes('resautaurant')
  )
}

export type FincaIndexEntry = {
  id: string
  code: string
  ln?: string
  nomKey?: string
}

type BuildFincaMatcherOptions = {
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
  normalizeSyncedCode: (raw?: string | null) => string | null
  normalizeIncomingZohoCode: (raw?: string | null) => string | null
  extractCodeFromName: (raw: string) => string | null
  isBadCode: (code?: string | null) => boolean
}

function pickBestByLn(
  items: FincaIndexEntry[],
  lnHint?: string
): FincaIndexEntry | null {
  if (!items.length) return null
  const lnBucket = normalizeLnBucket(lnHint)
  if (!lnBucket) return items[0]
  const sameLn = items.find((item) => normalizeLnBucket(item.ln) === lnBucket)
  return sameLn || items[0]
}

export function buildFincaMatcher({
  docs,
  normalizeSyncedCode,
  normalizeIncomingZohoCode,
  extractCodeFromName,
  isBadCode,
}: BuildFincaMatcherOptions) {
  const finquesByCode = new Map<string, FincaIndexEntry>()
  const finquesByName = new Map<string, FincaIndexEntry[]>()
  const finquesByCompactName = new Map<string, FincaIndexEntry[]>()
  const finquesList: FincaIndexEntry[] = []

  for (const doc of docs) {
    const data = doc.data() as {
      code?: string | number
      codi?: string | number
      nom?: string
      ln?: string
      LN?: string
    }
    const docIdCode = String(doc.id || '').trim().toUpperCase()
    const fallbackIdAsCode =
      /^(CCB|CCE|CCR|CCF|CEU)\d+$/i.test(docIdCode) ? docIdCode : ''
    const rawCode = String(data.code || data.codi || fallbackIdAsCode || '')
      .trim()
      .toUpperCase()
    const code = normalizeSyncedCode(rawCode) || rawCode
    const nom = String(data.nom || '')
    const nomKey = normalizeLocationKey(nom)
    const compactKey = normalizeLocationCompactKey(nom)

    if (!code) continue

    const entry: FincaIndexEntry = {
      id: doc.id,
      code,
      ln: String(data.ln || data.LN || ''),
      nomKey,
    }

    finquesList.push(entry)
    finquesByCode.set(code, entry)
    if (rawCode && rawCode !== code) {
      finquesByCode.set(rawCode, entry)
    }

    if (nomKey) {
      const prev = finquesByName.get(nomKey) || []
      prev.push(entry)
      finquesByName.set(nomKey, prev)
    }

    if (compactKey) {
      const prevCompact = finquesByCompactName.get(compactKey) || []
      prevCompact.push(entry)
      finquesByCompactName.set(compactKey, prevCompact)
    }
  }

  const fuzzyCache = new Map<string, FincaIndexEntry | null>()

  return function findFincaForUbicacio(
    ubicacions: (string | null | undefined)[],
    lnHint?: string
  ): FincaIndexEntry | null {
    const candidates = ubicacions
      .filter(Boolean)
      .map((item) => String(item).trim())
      .filter(Boolean)

    if (candidates.length === 0) return null

    for (const raw of candidates) {
      const code = normalizeIncomingZohoCode(extractCodeFromName(raw))
      if (code && !isBadCode(code)) {
        const fincaByCode = finquesByCode.get(code)
        if (fincaByCode) return fincaByCode
      }

      const nameKey = normalizeLocationKey(raw)
      const compactKey = normalizeLocationCompactKey(raw)
      if (!nameKey) continue

      const byName = finquesByName.get(nameKey)
      const exactMatch = byName ? pickBestByLn(byName, lnHint) : null
      if (exactMatch) return exactMatch

      const byCompact = compactKey ? finquesByCompactName.get(compactKey) : null
      const compactMatch = byCompact ? pickBestByLn(byCompact, lnHint) : null
      if (compactMatch) return compactMatch

      const lnBucket = normalizeLnBucket(lnHint)
      const cacheKey = `${nameKey}::${lnBucket}`
      if (fuzzyCache.has(cacheKey)) {
        const cached = fuzzyCache.get(cacheKey)
        if (cached) return cached
        continue
      }

      let best: FincaIndexEntry | null = null
      let bestScore = 0
      let bestLnMatch = false

      for (const finca of finquesList) {
        const fincaKey = finca.nomKey || ''
        if (!fincaKey) continue

        const score = nameSimilarity(nameKey, fincaKey)
        if (score < 0.9) continue

        const lnMatch = !!lnBucket && normalizeLnBucket(finca.ln) === lnBucket
        if (score > bestScore || (score === bestScore && lnMatch && !bestLnMatch)) {
          best = finca
          bestScore = score
          bestLnMatch = lnMatch
        }
      }

      fuzzyCache.set(cacheKey, best)
      if (best) return best
    }

    return null
  }
}
