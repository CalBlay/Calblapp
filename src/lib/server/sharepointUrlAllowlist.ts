export function isAllowedSharePointFetchUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false

    const host = parsed.hostname.toLowerCase()
    const siteDomain = (process.env.SHAREPOINT_SITE_DOMAIN || '').toLowerCase().trim()
    if (siteDomain && (host === siteDomain || host.endsWith(`.${siteDomain}`))) {
      return true
    }

    return host === 'sharepoint.com' || host.endsWith('.sharepoint.com')
  } catch {
    return false
  }
}
