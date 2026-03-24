// file: src/components/calendar/CalendarNewEventModal.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import SearchFincaInput from '@/components/shared/SearchFincaInput'
import SearchServeiInput from '@/components/shared/SearchServeiInput'
import { ExternalLink } from 'lucide-react'
import AttachFileButton from '@/components/calendar/AttachFileButton'

interface Props {
  date: string           // data de la casella clicada
  trigger: React.ReactNode
  onSaved?: () => void
}

interface EventFormData {
  code: string
  LN: string
  NomEvent: string
  DataInici: string
  DataFi?: string
  HoraInici?: string
  NumPax: string
  Ubicacio: string | Record<string, unknown>
  Servei: string | Record<string, unknown>
  Comercial: string
}

/**
 * CalendarNewEventModal
 * - Crea un nou esdeveniment a la col·leccio stage_verd
 * - Data inicial = data de la casella clicada
 * - Si la finca o el servei no existeixen, els crea automàticament
 */
export default function CalendarNewEventModal({ date, trigger, onSaved }: Props) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [files, setFiles] = useState<{ key: string; url: string }[]>([])
  const [multiDay, setMultiDay] = useState(false)
  const [comercialCandidates, setComercialCandidates] = useState<
    { name: string; department: string }[]
  >([])
  const [comercialOptions, setComercialOptions] = useState<string[]>([])
  const [comercialLoading, setComercialLoading] = useState(false)

  const norm = (s?: string | null) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

  const mapDepartmentToLN = (dep?: string) => {
    const d = norm(dep || '')
    if (d === 'empresa') return 'Empresa'
    if (d === 'casaments') return 'Casaments'
    if (d === 'food lover' || d === 'foodlover' || d === 'foodlovers') return 'Foodlovers'
    return ''
  }

  const mapLNToDepartment = (ln?: string) => {
    const l = norm(ln || '')
    if (l === 'empresa') return 'empresa'
    if (l === 'casaments') return 'casaments'
    if (l === 'foodlovers' || l === 'food lover' || l === 'foodlover') return 'food lover'
    return ''
  }

  const role = norm((session?.user as any)?.role)
  const department = norm((session?.user as any)?.department)
  const userName = String((session?.user as any)?.name || '').trim()
  const defaultLN = mapDepartmentToLN((session?.user as any)?.department)
  const isAdmin = role === 'admin'
  const isDireccio = role === 'direccio' || role === 'direccion'
  const isProduccio = department === 'produccio'
  const isComercial = department === 'comercial'
  const isCapDepartament =
    role === 'cap' ||
    role === 'capdepartament' ||
    role.includes('cap')

  const canEdit = isAdmin || isDireccio || isProduccio || isComercial || isCapDepartament

  // Dades del nou esdeveniment
  const [formData, setFormData] = useState<EventFormData>({
    code: '',
    LN: '',
    NomEvent: '',
    DataInici: date || '',
    DataFi: '',
    HoraInici: '',
    NumPax: '',
    Ubicacio: '',
    Servei: '',
    Comercial: '',
  })

  const handleChange = (
    field: keyof EventFormData,
    value: EventFormData[keyof EventFormData]
  ) => setFormData((prev) => ({ ...prev, [field]: value }))

  const currentComercial = useMemo(
    () => String(formData.Comercial || '').trim(),
    [formData.Comercial]
  )

  const hasCurrentComercialOption = useMemo(() => {
    if (!currentComercial) return false
    return comercialOptions.some((n) => norm(n) === norm(currentComercial))
  }, [comercialOptions, currentComercial])

  useEffect(() => {
    if (!open) return
    if (comercialCandidates.length > 0) return

    let active = true
    const load = async () => {
      try {
        setComercialLoading(true)
        const res = await fetch('/api/users')
        const data = await res.json()
        if (!Array.isArray(data)) return

        const candidates = data
          .map((u: any) => {
            const name = String(u?.name || '').trim()
            const roleRaw =
              u?.role ??
              u?.Role ??
              u?.rol ??
              u?.Rol ??
              ''
            const categoryRaw =
              u?.categoria ??
              u?.Categoria ??
              u?.category ??
              u?.Category ??
              ''
            const depRaw =
              u?.department ??
              u?.Department ??
              u?.departament ??
              u?.Departament ??
              ''

            const roleText = norm(String(roleRaw))
            const categoryText = norm(String(categoryRaw))
            const roleBucket = `${roleText} ${categoryText}`.trim()

            return {
              name,
              department: norm(String(depRaw)),
              roleBucket,
            }
          })
          .filter((c: any) => {
            if (!c.name) return false
            return c.roleBucket.includes('comercial') || c.roleBucket.includes('cap')
          })
          .map((c: any) => ({ name: c.name, department: c.department }))

        if (active) setComercialCandidates(candidates)
      } catch (err) {
        console.error('Error carregant comercials:', err)
      } finally {
        if (active) setComercialLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [open, comercialCandidates.length])

  useEffect(() => {
    const targetDept = mapLNToDepartment(formData.LN)
    const filtered = targetDept
      ? comercialCandidates.filter((c) => c.department === targetDept)
      : comercialCandidates

    const names = filtered
      .map((c) => c.name)
      .filter((n) => n && String(n).trim().length > 0)

    const uniq = Array.from(
      new Map(names.map((n: string) => [norm(n), n])).values()
    ).sort((a, b) => a.localeCompare(b, 'ca'))

    setComercialOptions(uniq)
  }, [comercialCandidates, formData.LN])

  useEffect(() => {
    if (!open) return
    if (!userName) return
    setFormData((prev) => {
      if (String(prev.Comercial || '').trim()) return prev
      return { ...prev, Comercial: userName }
    })
  }, [open, userName])

  useEffect(() => {
    if (!open) return
    if (!defaultLN) return
    setFormData((prev) => {
      if (String(prev.LN || '').trim()) return prev
      return { ...prev, LN: defaultLN }
    })
  }, [open, defaultLN])

  // Comprova si existeix una finca o servei i el crea si cal
  const ensureExists = async (collection: 'finques' | 'serveis', nom: string) => {
    const clean = nom.trim()
    if (!clean) return
    try {
      const searchRes = await fetch(`/api/${collection}/search?q=${encodeURIComponent(clean)}`)
      const json = await searchRes.json()
      const exists = Array.isArray(json.data) && json.data.some((i: any) => i.nom === clean)
      if (!exists) {
        await fetch(`/api/${collection}/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: clean, codi: `AUTO_${Date.now()}` }),
        })
      }
    } catch (err) {
      console.error(`Error comprovant ${collection}:`, err)
    }
  }

  // Normalitza ubicacio i servei (compatibles amb objecte o string)
  const ubicacioValue =
    typeof formData.Ubicacio === 'object' && formData.Ubicacio !== null
      ? ((formData.Ubicacio as Record<string, unknown>)?.nom as string) || ''
      : (formData.Ubicacio as string) || ''

  const serveiValue =
    typeof formData.Servei === 'object' && formData.Servei !== null
      ? ((formData.Servei as Record<string, unknown>)?.nom as string) || ''
      : (formData.Servei as string) || ''

  // Desa l'esdeveniment nou reutilitzant /api/calendar/attachments
  const handleSave = async () => {
    if (!canEdit) {
      alert('No tens permisos per crear esdeveniments.')
      return
    }

    if (!formData.NomEvent || !formData.Ubicacio) {
      alert('Cal indicar com a mínim Nom i Ubicació.')
      return
    }

    setSaving(true)
    try {
      await ensureExists('finques', ubicacioValue)
      await ensureExists('serveis', serveiValue)

      const payload: Record<string, any> = {
        code: formData.code || '',
        NomEvent: formData.NomEvent || 'Sense nom',
        DataInici: formData.DataInici || new Date().toISOString().slice(0, 10),
        DataFi: formData.DataFi || formData.DataInici || null,
        HoraInici: formData.HoraInici || null,
        NumPax: formData.NumPax || null,
        Ubicacio: ubicacioValue,
        Servei: serveiValue,
        Comercial: formData.Comercial || '',
        LN: formData.LN || 'Altres',
        origen: 'manual',
        collection: 'stage_verd',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      console.log('Enviant payload:', payload)

      const res = await fetch('/api/events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      console.log('Resposta backend:', data)

      if (!res.ok || !data?.id) {
        throw new Error(data?.error || 'Error backend')
      }

      setCreatedId(data.id)

      if (files.length > 0) {
        const filePayload: Record<string, string> = {}
        files.forEach((f) => {
          filePayload[f.key] = f.url
        })

        await fetch(`/api/calendar/manual/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...filePayload,
            collection: 'stage_verd',
          }),
        })

        console.log('Fitxers desats correctament en el document:', data.id)
      }

      alert('Esdeveniment creat correctament')
      setOpen(false)
      onSaved?.()
    } catch (err) {
      console.error('Error creant esdeveniment:', err)
      alert('No s\'ha pogut crear l\'esdeveniment.')
    } finally {
      setSaving(false)
    }
  }

  // Neteja el formulari
  const handleClear = () => {
    setFormData({
      code: '',
      NomEvent: '',
      DataInici: date || '',
      DataFi: '',
      HoraInici: '',
      NumPax: '',
      Ubicacio: '',
      Servei: '',
      Comercial: userName || '',
      LN: defaultLN || '',
    })
  }

  // Obre automàticament el modal quan rep una data
  useEffect(() => {
    if (date) setOpen(true)
  }, [date])

  // Eliminar un fitxer adjunt (només local)
  const handleDeleteFile = async (key: string) => {
    if (!confirm('Vols eliminar aquest enllaç del document?')) return
    setFiles((prev) => prev.filter((f) => f.key !== key))
    alert('Enllaç eliminat correctament')
  }

  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      <DialogTrigger
        asChild
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {trigger}
      </DialogTrigger>
      <DialogContent
        className="
          w-full 
          max-w-lg 
          h-[92dvh]
          max-h-[92dvh]
          overflow-y-auto 
          rounded-none
          pt-10
          sm:rounded-lg
          sm:h-auto
          sm:max-h-[85vh]
          sm:pt-6
        "
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Nou esdeveniment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-gray-700">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Linia de negoci</label>
            <select
              value={formData.LN}
              onChange={(e) => handleChange('LN', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">-- Selecciona --</option>
              <option value="Empresa">Empresa</option>
              <option value="Casaments">Casaments</option>
              <option value="Grups Restaurants">Grups Restaurants</option>
              <option value="Foodlovers">Foodlovers</option>
              <option value="Agenda">Agenda</option>
              <option value="Altres">Altres</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom</label>
            <Input
              value={formData.NomEvent}
              onChange={(e) => handleChange('NomEvent', e.target.value)}
              placeholder="Nom de l'esdeveniment"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Codi</label>
            <Input
              value={formData.code}
              onChange={(e) => handleChange('code', e.target.value)}
              placeholder="Codi intern o de document"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Data inici</label>
            <Input
              type="date"
              value={formData.DataInici}
              onChange={(e) => handleChange('DataInici', e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={multiDay}
              onChange={(e) => {
                setMultiDay(e.target.checked)
                if (!e.target.checked) handleChange('DataFi', '')
              }}
              id="multiDay"
              className="w-4 h-4"
            />
            <label htmlFor="multiDay" className="text-xs text-gray-600">
              L'esdeveniment dura més d'un dia
            </label>
          </div>

          {multiDay ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data fi</label>
              <Input
                type="date"
                value={formData.DataFi || ''}
                onChange={(e) => handleChange('DataFi', e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hora inici</label>
              <Input
                type="time"
                value={formData.HoraInici || ''}
                onChange={(e) => handleChange('HoraInici', e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Ubicacio</label>
            <SearchFincaInput
              value={typeof formData.Ubicacio === 'string' ? formData.Ubicacio : ''}
              onChange={(val) => handleChange('Ubicacio', val)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Servei</label>
            <SearchServeiInput
              value={typeof formData.Servei === 'string' ? formData.Servei : ''}
              onChange={(val) => handleChange('Servei', val)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Comercial</label>
            <select
              value={formData.Comercial}
              onChange={(e) => handleChange('Comercial', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={comercialLoading}
            >
              <option value="">
                {comercialLoading ? 'Carregant...' : '-- Selecciona --'}
              </option>
              {currentComercial && !hasCurrentComercialOption && (
                <option value={currentComercial} hidden>
                  {currentComercial}
                </option>
              )}
              {comercialOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Num. de persones</label>
            <Input
              type="number"
              value={formData.NumPax}
              onChange={(e) => handleChange('NumPax', e.target.value)}
              placeholder="Nombre estimat de comensals"
            />
          </div>
        </div>

        <div className="pt-3 border-t mt-4 space-y-3">
          <label className="block text-xs text-gray-500 mb-2">
            Documents de l'esdeveniment (SharePoint)
          </label>

          <div className="mt-2 space-y-1">
            {!createdId && (
              <p className="text-xs text-gray-500">
                Desa l'esdeveniment abans d'adjuntar documents
              </p>
            )}

            <AttachFileButton
              collection="stage_verd"
              docId={createdId || ''}
              disabled={!createdId || !canEdit}
              existingKeys={files.map((f) => f.key)}
              onAdded={(att) => {
                setFiles((prev) => [...prev, { key: att.key, url: att.url }])
              }}
            />
          </div>

          <div className="border rounded-md p-2 bg-gray-50">
            {files.length === 0 ? (
              <p className="text-sm text-gray-400 text-center">No hi ha documents afegits</p>
            ) : (
              <ul className="space-y-1">
                {files.map(({ key, url }) => (
                  <li
                    key={`${key}-${url}`}
                    className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded-md shadow-sm hover:bg-gray-100"
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex-1 break-all flex items-center gap-1"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      {decodeURIComponent(url.split('/').pop() || url)}
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 text-xs shrink-0"
                      onClick={() => handleDeleteFile(key)}
                    >
                      Elimina
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4 flex flex-col gap-2">
          {!canEdit && (
            <p className="text-sm text-red-600 text-center w-full">
              No tens permisos per crear esdeveniments.
            </p>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !canEdit}
            className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
          >
            Desa esdeveniment
          </Button>
          <Button onClick={handleClear} variant="outline" className="w-full" disabled={!canEdit}>
            Neteja
          </Button>
          <Button
            onClick={() => setOpen(false)}
            variant="secondary"
            className="w-full bg-gray-200 hover:bg-gray-300"
          >
            Cancel·la
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
