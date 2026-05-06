import { optimizeImageForStorage } from '@/lib/media/optimizeImageBuffer'

export type ProcessedUploadImage = {
  buffer: Buffer
  contentType: string
  extension: string
  meta: { size: number; type: string }
}

/** Llegeix el File, optimitza al servidor i retorna buffer + metadades per Storage. */
export async function processUploadedImageFile(file: File): Promise<ProcessedUploadImage> {
  const rawType = file.type || 'image/jpeg'
  const raw = Buffer.from(await file.arrayBuffer())
  const { buffer, contentType, extension } = await optimizeImageForStorage(raw, rawType)
  return {
    buffer,
    contentType,
    extension,
    meta: { size: buffer.length, type: contentType },
  }
}
