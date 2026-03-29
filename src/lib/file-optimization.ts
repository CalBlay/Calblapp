'use client'

type OptimizeImageOptions = {
  maxBytes: number
  maxDimension?: number
  initialQuality?: number
  minQuality?: number
}

const RASTER_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No s ha pogut llegir la imatge'))
    }
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No s ha pogut convertir la imatge'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      quality
    )
  })

const buildOptimizedName = (name: string) =>
  name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_') + '.jpg'

export async function optimizeImageFile(
  file: File,
  {
    maxBytes,
    maxDimension = 1600,
    initialQuality = 0.82,
    minQuality = 0.5,
  }: OptimizeImageOptions
): Promise<File> {
  if (!RASTER_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
    return file
  }

  if (file.size <= maxBytes * 0.85) {
    return file
  }

  const image = await loadImage(file)
  let width = image.naturalWidth || image.width
  let height = image.naturalHeight || image.height
  const maxSide = Math.max(width, height)
  if (maxSide > maxDimension) {
    const ratio = maxDimension / maxSide
    width = Math.max(1, Math.round(width * ratio))
    height = Math.max(1, Math.round(height * ratio))
  }

  let canvas = document.createElement('canvas')
  let context = canvas.getContext('2d')
  if (!context) return file

  let quality = initialQuality
  let currentWidth = width
  let currentHeight = height
  let bestFile = file

  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = currentWidth
    canvas.height = currentHeight
    context.clearRect(0, 0, currentWidth, currentHeight)
    context.drawImage(image, 0, 0, currentWidth, currentHeight)

    let blob = await canvasToBlob(canvas, quality)
    let optimized = new File([blob], buildOptimizedName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })

    if (optimized.size < bestFile.size) {
      bestFile = optimized
    }

    if (optimized.size <= maxBytes) {
      return optimized
    }

    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - 0.1)
      continue
    }

    currentWidth = Math.max(1, Math.round(currentWidth * 0.82))
    currentHeight = Math.max(1, Math.round(currentHeight * 0.82))
    quality = initialQuality
  }

  return bestFile
}

export async function optimizeUploadFile(file: File, maxBytes: number): Promise<File> {
  if (String(file.type || '').toLowerCase().startsWith('image/')) {
    return optimizeImageFile(file, { maxBytes })
  }
  return file
}
