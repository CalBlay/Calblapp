'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import SearchFincaInput from '@/components/shared/SearchFincaInput'
import SearchZohoClientInput from '@/components/shared/SearchZohoClientInput'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'
import {
  SPACES_ACTION,
  SPACES_RESERVES_PATH,
} from '@/lib/spacesPermissions'

type FormState = {
  Comercial: string
  NomClient: string
  Comentari: string
  Ubicacio: string
  DataInici: string
}

export type ManualReserveEditPayload = {
  id: string
  Comercial: string
  NomClient: string
  Comentari: string
  Ubicacio: string
  DataInici: string
}

type SessionUserFields = {
  name?: string | null
  email?: string | null
}

function defaultComercialFromSession(user: SessionUserFields | undefined): string {
  const name = String(user?.name || '').trim()
  if (name) return name
  const email = String(user?.email || '').trim()
  if (!email.includes('@')) return email
  return email.split('@')[0] || ''
}

function emptyForm(defaultDate: string, comercialDefault = ''): FormState {
  return {
    Comercial: comercialDefault,
    NomClient: '',
    Comentari: '',
    Ubicacio: '',
    DataInici: defaultDate,
  }
}

function formFromEdit(edit: ManualReserveEditPayload): FormState {
  return {
    Comercial: edit.Comercial,
    NomClient: edit.NomClient,
    Comentari: edit.Comentari,
    Ubicacio: edit.Ubicacio,
    DataInici: edit.DataInici,
  }
}

interface Props {
  defaultDate: string
  trigger?: React.ReactNode
  onSaved?: () => void
  editReserve?: ManualReserveEditPayload | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export default function SpacesManualReserveModal({
  defaultDate,
  trigger,
  onSaved,
  editReserve = null,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const { data: session } = useSession()
  const { canEditPath, uiActions, ready: permsReady } = useUiPermissions()
  const [internalOpen, setInternalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEditMode = Boolean(editReserve?.id)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? controlledOnOpenChange ?? (() => {}) : setInternalOpen

  const sessionUser = session?.user as SessionUserFields | undefined
  const defaultComercial = useMemo(
    () => defaultComercialFromSession(sessionUser),
    [sessionUser]
  )

  const [form, setForm] = useState<FormState>(() =>
    editReserve ? formFromEdit(editReserve) : emptyForm(defaultDate, defaultComercial)
  )

  const canCreate = useMemo(() => {
    if (!permsReady) return true
    if (canEditPath(SPACES_RESERVES_PATH)) return true
    return (
      uiActions[
        PERM.action(SPACES_RESERVES_PATH, SPACES_ACTION.RESERVES_MANUAL_CREATE)
      ] === true
    )
  }, [permsReady, canEditPath, uiActions])

  useEffect(() => {
    if (!open) return
    if (editReserve) {
      setForm(formFromEdit(editReserve))
      return
    }
    setForm(emptyForm(defaultDate, defaultComercial))
  }, [open, editReserve, defaultDate, defaultComercial])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && !editReserve) {
      setForm(emptyForm(defaultDate, defaultComercial))
    }
  }

  const handleSave = async () => {
    const comercial = form.Comercial.trim()
    const nomClient = form.NomClient.trim()
    const comentari = form.Comentari.trim()
    const ubicacio = form.Ubicacio.trim()
    const dataInici = form.DataInici.trim()

    if (!comercial || !nomClient || !ubicacio || !dataInici) {
      alert('Omple tots els camps obligatoris.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        Comercial: comercial,
        NomClient: nomClient,
        Comentari: comentari,
        Ubicacio: ubicacio,
        DataInici: dataInici,
        DataFi: dataInici,
      }

      const res = await fetch('/api/spaces/manual-reserves', {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEditMode ? { ...payload, id: editReserve!.id } : payload
        ),
      })
      const data = await res.json()
      if (!res.ok || (isEditMode ? !data?.ok : !data?.id)) {
        throw new Error(data?.error || 'Error desant la reserva')
      }

      alert(
        isEditMode
          ? 'Reserva manual actualitzada correctament'
          : 'Reserva manual creada correctament'
      )
      setOpen(false)
      onSaved?.()
    } catch (err) {
      console.error('Error desant reserva manual:', err)
      alert(err instanceof Error ? err.message : 'Error desant la reserva manual')
    } finally {
      setSaving(false)
    }
  }

  if (!isEditMode && !canCreate) return null
  if (isEditMode && !open) return null

  const dialog = (
    <Dialog modal={false} open={open} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Editar reserva manual' : 'Nova reserva manual'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-gray-600">Comercial</label>
            <Input
              value={form.Comercial}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, Comercial: e.target.value }))
              }
              placeholder="Nom del comercial"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Client</label>
            <SearchZohoClientInput
              value={form.NomClient}
              onChange={(val) =>
                setForm((prev) => ({ ...prev, NomClient: val }))
              }
              disabled={saving}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Data</label>
            <Input
              type="date"
              value={form.DataInici}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, DataInici: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Ubicació</label>
            <SearchFincaInput
              value={form.Ubicacio}
              onChange={(val) =>
                setForm((prev) => ({ ...prev, Ubicacio: val }))
              }
              disabled={saving}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Comentari <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.Comentari}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, Comentari: e.target.value }))
              }
              placeholder="Comentari de la reserva"
              className="w-full min-h-[88px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel·lar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Desant…' : 'Desar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return dialog
}
