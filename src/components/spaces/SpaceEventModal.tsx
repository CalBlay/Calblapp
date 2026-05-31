//file: src/components/spaces/SpaceEventModal.tsx
'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { COLORS_LN } from '@/lib/colors'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { SPACES_RESERVES_PATH } from '@/lib/spacesPermissions'
import SpacesManualReserveModal, {
  type ManualReserveEditPayload,
} from '@/components/spaces/SpacesManualReserveModal'

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
  onMutated?: () => void
}

/**
 * 🔹 Modal de lectura d'esdeveniment (Espais)
 * 100% mobile-first, només lectura. Mostra dades bàsiques del Firestore.
 * Inclou color de LN segons definició a /lib/colors.ts
 */
export default function SpaceEventModal({
  open,
  onOpenChange,
  event,
  onMutated,
}: SpaceEventModalProps) {
  const { data: session } = useSession()
  const { canEditPath, ready: permsReady } = useUiPermissions()
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sessionUserId = String(
    (session?.user as { id?: string } | undefined)?.id || ''
  ).trim()

  const editReserve = useMemo((): ManualReserveEditPayload | null => {
    if (!event) return null
    const id = readString(event.id)
    if (!id) return null
    return {
      id,
      Comercial:
        readString(event.Comercial) || readString(event.commercial),
      NomClient:
        readString(event.NomClient) ||
        readString(event.NomEvent) ||
        readString(event.eventName),
      Comentari:
        readString(event.Comentari) ||
        readString(event.comentari) ||
        readString(event.observacions),
      Ubicacio:
        readString(event.Ubicacio) ||
        readString(event.ubicacio) ||
        readString(event.finca) ||
        readString(event.Finca),
      DataInici:
        readString(event.DataInici) || readString(event.date),
    }
  }, [event])

  if (!event) return null

  // Normalitza LN i obté color
  const lnName = readString(event.LN) || readString(event.ln) || 'Sense LN'
  const lnKey = lnName.toLowerCase().trim()
  const lnColor = COLORS_LN?.[lnKey] || 'bg-gray-200 text-gray-700'

  // Assegurem que el camp code es llegeix correctament
  const eventCode = readDisplay(event.code, '') || readDisplay(event.Code)
  const observacions =
    readString(event.observacions).trim() ||
    readString(event.Comentari).trim() ||
    readString(event.comentari).trim()
  const isManual =
    event.isManual === true ||
    readString(event.stage).toLowerCase() === 'lila'
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

  const createdBy = readString(event.createdBy)
  const isOwner = Boolean(sessionUserId && createdBy && sessionUserId === createdBy)
  const hasSpacesEdit = permsReady && canEditPath(SPACES_RESERVES_PATH)
  const canMutateManual = isManual && (isOwner || hasSpacesEdit)

  const handleDelete = async () => {
    const id = readString(event.id)
    if (!id || !canMutateManual) return
    if (!confirm('Vols eliminar aquesta reserva manual?')) return

    setDeleting(true)
    try {
      const res = await fetch(
        `/api/spaces/manual-reserves?id=${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Error eliminant la reserva')
      }
      alert('Reserva manual eliminada correctament')
      onOpenChange(false)
      onMutated?.()
    } catch (err) {
      console.error('Error eliminant reserva manual:', err)
      alert(err instanceof Error ? err.message : 'Error eliminant la reserva')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
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
            {isManual ? (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Tipus:</span>
                <Badge className="bg-violet-50 text-violet-800 border border-violet-200 font-medium px-2 py-1 text-[12px]">
                  Reserva manual
                </Badge>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Línia de Negoci:</span>
                <Badge
                  className={`${lnColor} border border-gray-200 shadow-sm font-medium px-2 py-1 text-[12px]`}
                >
                  {lnName}
                </Badge>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-gray-500">Comercial:</span>
              <span>{comercial || '-'}</span>
            </div>

            {!isManual && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">Servei:</span>
                  <span>{servei || '-'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-500">Codi:</span>
                  <span>{eventCode || '-'}</span>
                </div>
              </>
            )}

            <div className="flex justify-between">
              <span className="text-gray-500">Data:</span>
              <span>{dataInici || '-'}</span>
            </div>

            {!isManual && (
              <>
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
              </>
            )}
            {observacions && (
              <div
                className={`mt-3 rounded-md border p-2 ${
                  isManual
                    ? 'bg-violet-50 border-violet-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <p
                  className={`text-[11px] font-medium mb-1 ${
                    isManual ? 'text-violet-800' : 'text-yellow-800'
                  }`}
                >
                  {isManual ? 'Comentari' : 'Observacions'}
                </p>
                <p
                  className={`text-xs whitespace-pre-wrap ${
                    isManual ? 'text-violet-900' : 'text-yellow-900'
                  }`}
                >
                  {observacions}
                </p>
              </div>
            )}

            {canMutateManual && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setEditOpen(true)}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Eliminant…' : 'Eliminar'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {canMutateManual && editReserve && (
        <SpacesManualReserveModal
          defaultDate={editReserve.DataInici || ''}
          editReserve={editReserve}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => {
            setEditOpen(false)
            onOpenChange(false)
            onMutated?.()
          }}
        />
      )}
    </>
  )
}
