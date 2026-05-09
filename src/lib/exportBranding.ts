'use client'

import type { jsPDF } from 'jspdf'

const CAL_BLAY_LOGO_SRC = '/logo.png'

const BRAND_PRINT_STYLE = `
  .calblay-print-brand {
    display: flex;
    align-items: center;
    gap: 18px;
    margin: 0 0 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid #d7dfd8;
  }
  .calblay-print-brand__logo {
    width: 168px;
    height: 54px;
    object-fit: contain;
    object-position: left center;
    flex: 0 0 auto;
  }
  .calblay-print-brand__meta {
    min-width: 0;
    color: #4b5563;
    font-family: Arial, sans-serif;
  }
  .calblay-print-brand__eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #14532d;
    margin-bottom: 4px;
  }
  .calblay-print-brand__stamp {
    font-size: 11px;
    line-height: 1.45;
  }
`

function buildBrandHeaderHtml(): string {
  const generatedAt = new Date().toLocaleString('ca-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return `
    <div class="calblay-print-brand">
      <img
        src="${CAL_BLAY_LOGO_SRC}"
        alt="Cal Blay"
        class="calblay-print-brand__logo"
        data-calblay-print-logo="true"
      />
      <div class="calblay-print-brand__meta">
        <div class="calblay-print-brand__eyebrow">Cal Blay</div>
        <div class="calblay-print-brand__stamp">Generat: ${generatedAt}</div>
      </div>
    </div>
  `
}

export function brandPrintDocumentHtml(html: string): string {
  let branded = html
  let insertedDefaultHeader = false

  if (!/calblay-print-brand/.test(branded)) {
    branded = branded.replace(/<body([^>]*)>/i, `<body$1>${buildBrandHeaderHtml()}`)
    insertedDefaultHeader = true
  }

  if (!/calblay-print-brand__logo/.test(branded)) {
    return branded
  }

  if (!insertedDefaultHeader) {
    return branded
  }

  if (/<\/head>/i.test(branded)) {
    branded = branded.replace(/<\/head>/i, `<style>${BRAND_PRINT_STYLE}</style></head>`)
  } else {
    branded = `<style>${BRAND_PRINT_STYLE}</style>${branded}`
  }

  return branded
}

export function printBrandedHtmlInNewWindow(html: string): void {
  const win = window.open('', '_blank', 'width=1200,height=900')
  if (!win) return

  const branded = brandPrintDocumentHtml(html)
  win.document.open()
  win.document.write(branded)
  win.document.close()
  win.focus()

  const triggerPrint = () => window.setTimeout(() => win.print(), 180)
  const logo = win.document.querySelector('[data-calblay-print-logo="true"]') as HTMLImageElement | null

  if (!logo) {
    triggerPrint()
    return
  }

  if (logo.complete) {
    triggerPrint()
    return
  }

  let didTrigger = false
  const safeTrigger = () => {
    if (didTrigger) return
    didTrigger = true
    triggerPrint()
  }

  logo.addEventListener('load', safeTrigger, { once: true })
  logo.addEventListener('error', safeTrigger, { once: true })
  window.setTimeout(safeTrigger, 1500)
}

export async function fetchCalBlayLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(CAL_BLAY_LOGO_SRC)
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)

    try {
      return await new Promise<string | null>((resolve) => {
        const img = new Image()
        img.onload = () => {
          try {
            const maxWidth = 480
            const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1
            const width = Math.max(1, Math.round(img.naturalWidth * scale))
            const height = Math.max(1, Math.round(img.naturalHeight * scale))
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            if (!ctx) {
              resolve(null)
              return
            }

            // Flatten transparency onto white to keep the exported PDF compact.
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, width, height)
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', 0.72))
          } catch {
            resolve(null)
          }
        }
        img.onerror = () => resolve(null)
        img.src = objectUrl
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  } catch {
    return null
  }
}

export function addCalBlayLogoToPdf(
  pdf: jsPDF,
  logoDataUrl: string | null,
  {
    x,
    y,
    width = 72,
    height = 48,
  }: {
    x: number
    y: number
    width?: number
    height?: number
  }
): boolean {
  if (!logoDataUrl) return false
  try {
    const format = /^data:image\/jpeg/i.test(logoDataUrl) ? 'JPEG' : 'PNG'
    pdf.addImage(logoDataUrl, format, x, y, width, height, undefined, 'FAST')
    return true
  } catch {
    return false
  }
}
