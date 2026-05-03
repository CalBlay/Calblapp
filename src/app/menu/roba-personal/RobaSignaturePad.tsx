'use client'

import React, { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function RobaSignaturePad({
  onChange,
  initialDataUrl = null,
}: {
  onChange: (dataUrl: string | null) => void
  initialDataUrl?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const xy = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c) return { x: 0, y: 0 }
    const b = c.getBoundingClientRect()
    const scaleX = c.width / b.width
    const scaleY = c.height / b.height
    return { x: (e.clientX - b.left) * scaleX, y: (e.clientY - b.top) * scaleY }
  }

  const emit = () => {
    const c = canvasRef.current
    if (!c) return
    onChange(c.toDataURL('image/png'))
  }

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    if (!initialDataUrl) return
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
    }
    img.src = initialDataUrl
  }, [initialDataUrl])

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Signatura de recepcio (opcional)</Label>
        <p className="text-[11px] text-muted-foreground/80">
          Signa dins del requadre per deixar constancia de la recepcio.
        </p>
      </div>
      <canvas
        ref={canvasRef}
        width={480}
        height={160}
        className="w-full touch-none rounded-lg border border-input bg-white shadow-sm dark:bg-zinc-950"
        style={{ height: 152 }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drawing.current = true
          last.current = xy(e)
        }}
        onPointerUp={() => {
          drawing.current = false
          last.current = null
          emit()
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return
          const c = canvasRef.current
          if (!c) return
          const ctx = c.getContext('2d')
          if (!ctx) return
          const p = xy(e)
          ctx.strokeStyle = '#111827'
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(last.current.x, last.current.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          last.current = p
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full sm:w-auto"
        onClick={() => {
          const c = canvasRef.current
          if (!c) return
          c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
          onChange(null)
        }}
      >
        Esborrar signatura
      </Button>
    </div>
  )
}
