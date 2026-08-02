'use client'

/** Objectiu després de comprimir (com ~1 MB per imatges). */
export const DEFAULT_MAX_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024

/** Màxim abans de comprimir (gravació mòbil). */
export const MAX_VIDEO_INPUT_BYTES = 80 * 1024 * 1024

/** Durada màxima processada (segons). */
export const MAX_VIDEO_DURATION_SECONDS = 120

const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|avi|m4v)(\?|$)/i

export function isTicketImageMime(mime: string): boolean {
  return String(mime || '').toLowerCase().startsWith('image/')
}

export function isTicketVideoMime(mime: string): boolean {
  const value = String(mime || '').toLowerCase()
  return value.startsWith('video/')
}

export function isTicketVideoUrl(url: string): boolean {
  return VIDEO_EXTENSIONS.test(String(url || '').trim())
}

export function extensionForVideoMime(mime: string): string {
  const value = String(mime || '').toLowerCase()
  if (value.includes('quicktime')) return 'mov'
  if (value.includes('webm')) return 'webm'
  if (value.includes('msvideo') || value.includes('avi')) return 'avi'
  return 'mp4'
}

export function formatTicketAttachmentLimitMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

type RecordScaledVideoParams = {
  video: HTMLVideoElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  duration: number
  mimeType: string
  videoBitsPerSecond: number
}

function recordScaledVideo(params: RecordScaledVideoParams): Promise<Blob> {
  const { video, canvas, ctx, width, height, duration, mimeType, videoBitsPerSecond } = params
  const stream = canvas.captureStream(15)

  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
    const chunks: BlobPart[] = []
    let stopped = false
    let rafId = 0

    const finish = (err?: Error) => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(rafId)
      video.pause()
      if (err) reject(err)
      else resolve(new Blob(chunks, { type: mimeType }))
    }

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data)
    }
    recorder.onerror = () => finish(new Error('Error enregistrant el video'))
    recorder.onstop = () => finish()

    const drawFrame = () => {
      if (stopped) return
      ctx.drawImage(video, 0, 0, width, height)
      if (video.ended || video.currentTime >= duration - 0.05) {
        recorder.stop()
        return
      }
      rafId = requestAnimationFrame(drawFrame)
    }

    video.currentTime = 0
    video.playbackRate = 1
    video
      .play()
      .then(() => {
        recorder.start(250)
        drawFrame()
      })
      .catch(() => finish(new Error('No es pot reproduir el video per comprimir-lo')))

    window.setTimeout(() => {
      if (!stopped) recorder.stop()
    }, (duration + 8) * 1000)
  })
}

/**
 * Redueix resolució i bitrate del vídeo al navegador (mateix patró que les imatges).
 * Si ja és prou petit, es retorna sense canvis.
 */
export async function compressVideoForUpload(
  file: File,
  maxSizeBytes: number = DEFAULT_MAX_VIDEO_UPLOAD_BYTES
): Promise<File> {
  if (!isTicketVideoMime(file.type)) return file
  if (file.size <= maxSizeBytes) return file
  if (typeof window === 'undefined') return file

  const mimeType = pickRecorderMimeType()
  if (!mimeType) {
    if (file.size <= MAX_VIDEO_INPUT_BYTES) return file
    throw new Error('Aquest navegador no pot comprimir videos. Prova amb un fitxer mes petit.')
  }

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  const objectUrl = URL.createObjectURL(file)
  video.src = objectUrl

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('No es pot llegir el video'))
    })

    const duration = Math.min(
      Number.isFinite(video.duration) ? video.duration : MAX_VIDEO_DURATION_SECONDS,
      MAX_VIDEO_DURATION_SECONDS
    )
    const maxWidth = 1280
    const sourceW = video.videoWidth || maxWidth
    const sourceH = video.videoHeight || 720
    const scale = Math.min(1, maxWidth / Math.max(sourceW, 1))
    const width = Math.max(2, Math.round(sourceW * scale))
    const height = Math.max(2, Math.round(sourceH * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No es pot preparar el video')

    const bitrates = [900_000, 600_000, 400_000, 250_000, 150_000]
    let lastBlob: Blob | null = null

    for (const videoBitsPerSecond of bitrates) {
      const blob = await recordScaledVideo({
        video,
        canvas,
        ctx,
        width,
        height,
        duration,
        mimeType,
        videoBitsPerSecond,
      })
      lastBlob = blob
      if (blob.size <= maxSizeBytes) {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'video'
        return new File([blob], `${baseName}.${ext}`, {
          type: mimeType,
          lastModified: Date.now(),
        })
      }
    }

    if (lastBlob && lastBlob.size < file.size) {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'video'
      return new File([lastBlob], `${baseName}.${ext}`, {
        type: mimeType,
        lastModified: Date.now(),
      })
    }

    throw new Error(
      `No s'ha pogut reduir el video per sota de ${formatTicketAttachmentLimitMb(maxSizeBytes)}.`
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
    video.remove()
  }
}
