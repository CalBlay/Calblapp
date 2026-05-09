//file: src/components/spaces/SpaceEventModal.tsx
'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { COLORS_LN } from '@/lib/colors'

type SpaceEvent = Record<string, unknown>

const readString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const readDisplay = (value: unknown, fallback = '-'): string | number =>
  typeof value === 'string' || typeof value === 'number' ? value : fallback

const readNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

interface SpaceEventModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: SpaceEvent | null
}

/**
 * 🔹 Modal de lectura d'esdeveniment (Espais)
 * 100% mobile-first, només lectura. Mostra dades bàsiques del Firestore.
 * Inclou color de LN segons definició a /lib/colors.ts
 */
export default function SpaceEventModal({ open, onOpenChange, event }: SpaceEventModalProps) {
  if (!event) return null

  // Normalitza LN i obté color
  const lnName = readString(event.LN) || readString(event.ln) || 'Sense LN'
  const lnKey = lnName.toLowerCase().trim()
  const lnColor = COLORS_LN?.[lnKey] || 'bg-gray-200 text-gray-700'

  // Assegurem que el camp code es llegeix correctament
  const eventCode = readDisplay(event.code, '') || readDisplay(event.Code)
  const observacions = readString(event.observacions).trim()
  const ubicacio =
    readString(event.Ubicacio) ||
    readString(event.ubicacio) ||
    readString(event.finca) ||
    readString(event.Finca)
  const eventName = readString(event.NomEvent) || readString(event.eventName) || 'Esdeveniment'
  const comercial = readDisplay(event.Comercial, '') || readDisplay(event.commercial)
  const servei = readDisplay(event.Servei, '') || readDisplay(event.service)
  const dataInici = readDisplay(event.DataInici, '') || readDisplay(event.date)
  const horaInici = readDisplay(event.HoraInici, '') || readDisplay(event.startTime)
  const pax = readNumber(event.NumPax, Number.NaN)
  const fallbackPax = Number.isFinite(pax) ? pax : readNumber(event.numPax)



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl p-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-800">
            {eventName}
          </DialogTitle>
          <p className="text-sm text-gray-500">
            {ubicacio || 'Sense ubicació definida'}
          </p>
        </DialogHeader>

        <div className="mt-3 space-y-2 text-[13px] sm:text-sm">
          {/* Línia de negoci amb color */}
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Línia de Negoci:</span>
            <Badge
              className={`${lnColor} border border-gray-200 shadow-sm font-medium px-2 py-1 text-[12px]`}
            >
              {lnName}
            </Badge>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Comercial:</span>
            <span>{comercial || '-'}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Servei:</span>
            <span>{servei || '-'}</span>
          </div>


          <div className="flex justify-between">
            <span className="text-gray-500">Codi:</span>
            <span>{eventCode || '-'}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Data Inici:</span>
            <span>{dataInici || '-'}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Hora Inici:</span>
            <span>{horaInici || '-'}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Pax:</span>
            <span className="font-semibold text-gray-700">
              {fallbackPax}
            </span>
          </div>
          {observacions && (
  <div className="mt-3 rounded-md bg-yellow-50 border border-yellow-200 p-2">
    <p className="text-[11px] font-medium text-yellow-800 mb-1">
      Observacions
    </p>
    <p className="text-xs text-yellow-900 whitespace-pre-wrap">
      {observacions}
    </p>
  </div>
)}

        </div>
      </DialogContent>
    </Dialog>
  )
}


