import fs from 'fs'
import path from 'path'

/** Logo Cal Blay en base64 per adjunts HTML (correu, etc.). */
export function getCalBlayLogoDataUrl(): string | null {
  try {
    const filePath = path.join(process.cwd(), 'public', 'logo.png')
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
