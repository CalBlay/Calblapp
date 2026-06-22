'use client'

import { compressRasterImageForUpload } from '@/lib/file-optimization'
import { isLikelyImageFile } from '@/lib/media/isLikelyImageFile'
import { MAX_UPLOAD_IMAGE_BYTES } from '@/lib/media/uploadLimits'

/**
 * Prepara una imatge d'auditoria per pujar.
 * Fitxers ≤ 4 MB es pugen sense tocar (evita canvas en mòbils antics).
 * Només es comprimeix al client si superen el límit; la conversió HEIC etc. es fa al servidor.
 */
export async function prepareAuditImageUpload(file: File): Promise<File> {
  if (!isLikelyImageFile(file)) {
    throw new Error('Nomes es permeten imatges')
  }
  if (file.size <= 0) {
    throw new Error('El fitxer seleccionat es buit')
  }
  if (file.size <= MAX_UPLOAD_IMAGE_BYTES) {
    return file
  }

  try {
    const compressed = await compressRasterImageForUpload(file, MAX_UPLOAD_IMAGE_BYTES)
    if (compressed.size > MAX_UPLOAD_IMAGE_BYTES) {
      throw new Error('La imatge es massa gran despres de comprimir-la. Prova amb una foto mes petita.')
    }
    return compressed
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('massa gran')) throw err
      if (err.message.includes('No s ha pogut')) throw err
    }
    throw new Error(
      'La imatge es massa gran i no s ha pogut reduir en aquest dispositiu. Prova amb una foto mes petita.'
    )
  }
}

/** Espera que el navegador estabilitzi el DOM després de tancar càmera o selector de fitxers. */
export function afterMobileFilePicker(callback: () => void, source: 'camera' | 'gallery' = 'gallery') {
  const delayMs = source === 'camera' ? 200 : 450
  window.setTimeout(callback, delayMs)
}
