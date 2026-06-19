import { isLikelyImageFile } from '@/lib/media/isLikelyImageFile'
import { MAX_UPLOAD_IMAGE_BYTES } from '@/lib/media/uploadLimits'

/**
 * Prepara una imatge d'auditoria per pujar.
 * Sense compressió al client: evita crashes de canvas/Image en mòbils antics (HEIC, memòria baixa).
 * La conversió es fa al servidor amb Sharp.
 */
export function prepareAuditImageUpload(file: File): File {
  if (!isLikelyImageFile(file)) {
    throw new Error('Nomes es permeten imatges')
  }
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    throw new Error('La imatge es massa gran (maxim 4 MB). Prova amb una foto mes petita.')
  }
  if (file.size <= 0) {
    throw new Error('El fitxer seleccionat es buit')
  }
  return file
}

/** Espera que el navegador estabilitzi el DOM després de tancar càmera o selector de fitxers. */
export function afterMobileFilePicker(callback: () => void, source: 'camera' | 'gallery' = 'gallery') {
  const delayMs = source === 'camera' ? 200 : 450
  window.setTimeout(callback, delayMs)
}
