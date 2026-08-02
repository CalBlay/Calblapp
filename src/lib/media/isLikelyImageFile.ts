const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
  'bmp',
  'avif',
  'tif',
  'tiff',
])

function extensionFromName(name: string) {
  const base = String(name || '').trim().toLowerCase()
  const idx = base.lastIndexOf('.')
  if (idx < 0) return ''
  return base.slice(idx + 1)
}

/** Accepta MIME image/* o extensions habituals (galeria Android sovint deixa type buit). */
export function isLikelyImageFile(file: { type?: string; name?: string } | null | undefined) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  return IMAGE_EXTENSIONS.has(extensionFromName(String(file.name || '')))
}
