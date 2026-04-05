'use client'

/** Objectiu per defecte igual que incidències / auditoria (API 1MB). */
export const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 1024 * 1024

const SKIP_REENCODE_TYPES = new Set(['image/svg+xml', 'image/gif'])

function isRasterImageFile(file: File) {
  const type = String(file.type || '').toLowerCase()
  if (!type.startsWith('image/')) return false
  if (SKIP_REENCODE_TYPES.has(type)) return false
  return true
}

/**
 * Redueix imatges raster (JPEG/PNG/WebP/…) a ~maxSizeBytes com a JPEG,
 * redimensionant i baixant qualitat (mateix algorisme que auditoria/incidències).
 * Fitxers no imatge o SVG/GIF es retornen sense canviar.
 */
export async function compressRasterImageWithMeta(
  file: File,
  maxSizeBytes: number = DEFAULT_MAX_IMAGE_UPLOAD_BYTES
): Promise<{ file: File; width: number; height: number }> {
  if (!isRasterImageFile(file)) {
    return { file, width: 0, height: 0 }
  }

  const img = new Image()
  const tempUrl = URL.createObjectURL(file)
  img.src = tempUrl

  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('No s ha pogut llegir la imatge'))
    })
  } finally {
    URL.revokeObjectURL(tempUrl)
  }

  let maxDim = 1600
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { file, width, height }
  }

  let quality = 0.86
  let blob: Blob | null = null

  while (true) {
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (blob && blob.size <= maxSizeBytes) {
      break
    }
    if (quality > 0.38) {
      quality -= 0.08
      continue
    }
    if (maxDim <= 900) {
      break
    }
    maxDim = Math.max(900, Math.round(maxDim * 0.82))
    quality = 0.74
  }

  if (!blob) {
    throw new Error('No s ha pogut comprimir la imatge')
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  const out = new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return { file: out, width, height }
}

export async function compressRasterImageForUpload(
  file: File,
  maxSizeBytes: number = DEFAULT_MAX_IMAGE_UPLOAD_BYTES
): Promise<File> {
  const { file: out } = await compressRasterImageWithMeta(file, maxSizeBytes)
  return out
}

/** Imatges es comprimeixen cap a maxBytes; la resta de tipus es retornen igual. */
export async function optimizeUploadFile(file: File, maxBytes: number): Promise<File> {
  return compressRasterImageForUpload(file, maxBytes)
}
