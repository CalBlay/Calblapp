import sharp from 'sharp'

/** Costat llarg màxim després de redimensionar (px). */
const MAX_LONG_EDGE = 2560
const WEBP_QUALITY = 82
/** Límit d’entrada abans de passar per Sharp (bytes). */
export const MAX_IMAGE_PROCESS_BYTES = 12 * 1024 * 1024

export type OptimizedImageResult = {
  buffer: Buffer
  contentType: string
  extension: string
}

/**
 * Redimensiona, orienta segons EXIF, elimina metadades i codifica en WebP quan és possible.
 * Si el format no es pot processar, retorna el buffer original.
 */
export async function optimizeImageForStorage(
  input: Buffer,
  originalMime: string
): Promise<OptimizedImageResult> {
  if (input.length > MAX_IMAGE_PROCESS_BYTES) {
    throw new Error('Image too large')
  }

  const mime = (originalMime || '').toLowerCase()
  if (mime === 'image/gif') {
    return { buffer: input, contentType: mime || 'image/gif', extension: 'gif' }
  }

  try {
    const out = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAX_LONG_EDGE,
        height: MAX_LONG_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer()

    return { buffer: out, contentType: 'image/webp', extension: 'webp' }
  } catch {
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
    return {
      buffer: input,
      contentType: originalMime || 'image/jpeg',
      extension: ext,
    }
  }
}
