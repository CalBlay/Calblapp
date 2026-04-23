//file: src/components/calendar/CalendarModal.tsx
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
import type { Deal } from '@/hooks/useCalendarData'
import { ExternalLink } from 'lucide-react'
import SearchFincaInput from '@/components/shared/SearchFincaInput'
import SearchServeiInput from '@/components/shared/SearchServeiInput'
import AttachFileButton from '@/components/calendar/AttachFileButton'

interface Props {
  deal: Deal
  trigger: React.ReactNode
  onSaved?: () => void
  readonly?: boolean
}

type ComercialCandidate = {
  name: string
  departmentBucket: string
}

/**
 * CalendarModal (consulta i enllaços SharePoint)
 * - No puja fitxers. Guarda enllaços (file1, file2, ...)
 * - Llista enllaços guardats i permet obrir-los / eliminar-los
 * - Manté l’edició de camps bàsics si l’esdeveniment és Confirmat o manual
 */
export default function CalendarModal({ deal, trigger, onSaved, readonly }: Props) {
  console.log('🧩 Dades rebudes al modal:', deal)

  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [comercialPool, setComercialPool] = useState<ComercialCandidate[]>([])
  const [comercialLoading, setComercialLoading] = useState(false)
  const [codeDirty, setCodeDirty] = useState(false)

  const norm = (s?: string | null) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

  // Helper per recuperar camps sense importar majúscules/minúscules
  const get = (obj: any, ...keys: string[]) => {
    for (const k of keys) {
      const foundKey = Object.keys(obj || {}).find(
        (key) => key.toLowerCase() === k.toLowerCase()
      )
      if (foundKey) return obj[foundKey]
    }
    return undefined
  }

  // ✅ Dades del formulari de l’esdeveniment (estat inicial)
  const [editData, setEditData] = useState(() => ({
    // 🔧 FIX: abans hi havia get('ev.code'...) amb string literal. Ara és get(deal,...)
    LN: get(deal, 'LN', 'ln', 'liniaNegoci') || 'Altres',
    code: get(deal, 'code', 'codi', 'eventcode', 'codigo', 'C_digo') || '',
    NomEvent: get(deal, 'NomEvent', 'nomEvent', 'summary') || '',
    DataInici: get(deal, 'DataInici', 'dataInici', 'Data', 'dateStart') || '',
    DataFi: get(deal, 'DataFi', 'dataFi', 'dateEnd') || '',
    HoraInici: get(deal, 'HoraInici', 'horaInici', 'Hora', 'hora') || '',
    HoraFi: get(deal, 'HoraFi', 'horaFi') || '',
    NumPax: get(deal, 'NumPax', 'numPax', 'pax') ?? '',
    Ubicacio: get(deal, 'Ubicacio', 'ubicacio', 'location') || '',
    Servei: get(deal, 'Servei', 'servei', 'service') || '',
    Comercial: get(deal, 'Comercial', 'comercial', 'responsable') || '',
  }))

  // Guarda una còpia per poder fer reset si cal
  const [initialData, setInitialData] = useState(editData)

  // Fitxers (file1, file2, ...) llegits del deal
  const [files, setFiles] = useState<{ key: string; url: string }[]>([])
  const [multiDay, setMultiDay] = useState(false)

  // Només editable si és Confirmat o manual (respectant readonly si ve informat)
  const isZohoVerd =
    ['verd', 'stage_verd'].includes(String(deal?.collection || '')) &&
    deal.origen === 'zoho'
  const isManual = deal.origen !== 'zoho'

  const normalizeDept = (value?: string | null) => {
    const base = norm(value)
    const compact = base.replace(/\s+/g, '')
    if (compact === 'foodlover' || compact === 'foodlovers') return 'foodlovers'
    if (compact === 'grupsrestaurants') return 'grups restaurants'
    return base
  }

  const normalizeDeptForLnBucket = (value?: string | null) => {
    const base = normalizeDept(value)
    if (!base) return ''
    const compact = base.replace(/\s+/g, '')
    if (compact === 'restauracio' || compact === 'restaurants') return 'grups restaurants'
    if (base === 'altres') return ''
    if (base.includes('menjar')) return 'foodlovers'
    return base
  }

  const role = norm((session?.user as any)?.role)
  const department = normalizeDept((session?.user as any)?.department)
  const isAdmin = role === 'admin'
  const isDireccio = role === 'direccio' || role === 'direccion'
  const isProduccio = department === 'produccio'
  const isComercial = department === 'comercial'
  const isCap = role.includes('cap')
  const isCapCalendarDept =
    isCap &&
    [
      'casaments',
      'empresa',
      'restauracio',
      'restaurants',
      'grups restaurants',
      'foodlovers',
      'food lover',
    ].includes(department)

  const canEditStageVerd =
    isZohoVerd &&
    (isAdmin || isDireccio || isProduccio || isComercial || isCapCalendarDept)
  const canEditManual =
    isManual &&
    (isAdmin || isDireccio || isProduccio || isComercial || isCapCalendarDept)

  const canEdit = !readonly && (canEditStageVerd || canEditManual)
  const canEditCode = isAdmin || isProduccio

  const allowedDepartments = useMemo(() => {
    const bucket = normalizeDeptForLnBucket(editData.LN)
    return bucket ? [bucket] : []
  }, [editData.LN])

  const filteredComercialOptions = useMemo(() => {
    const names = comercialPool
      .filter((candidate) => {
        if (allowedDepartments.length === 0) return true
        return allowedDepartments.includes(candidate.departmentBucket)
      })
      .map((candidate) => candidate.name)
    return names.sort((a, b) => a.localeCompare(b, 'ca'))
  }, [comercialPool, allowedDepartments])

  const comercialOptionsWithCurrent = useMemo(() => {
    const current = String(editData.Comercial || '').trim()
    if (!current) return filteredComercialOptions
    const exists = filteredComercialOptions.some(
      (n) => norm(n) === norm(current)
    )
    return exists ? filteredComercialOptions : [current, ...filteredComercialOptions]
  }, [filteredComercialOptions, editData.Comercial])

  useEffect(() => {
    if (!open) return
    if (comercialPool.length > 0) return

    let active = true
    const load = async () => {
      try {
        setComercialLoading(true)
        const res = await fetch('/api/users')
        const data = await res.json()
        if (!Array.isArray(data)) return

        const candidates: ComercialCandidate[] = data
          .filter((u: any) => {
            const roleRaw = u?.role ?? ''
            const r = norm(String(roleRaw))
            return (
              r === 'comercial' ||
              r === 'cap' ||
              r === 'cap departament' ||
              r === 'capdepartament'
            )
          })
          .map((u: any) => ({
            name: String(u?.name || '').trim(),
            departmentBucket: normalizeDeptForLnBucket(u?.department),
          }))
          .filter((candidate) => candidate.name.length > 0)

        const uniq = Array.from(
          new Map<string, ComercialCandidate>(
            candidates.map((candidate) => [norm(candidate.name), candidate])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name, 'ca'))

        if (active) setComercialPool(uniq)
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
  }, [open, comercialPool.length])

  // Col·lecció: sempre guardem a stage_verd (segons decisió)
  const COLLECTION = 'stage_verd' as const

  // 📝 Observacions Zoho (read-only)
  const ObservacionsZoho = useMemo(() => {
    return (
      get(
        deal,
        'ObservacionsZoho',
        'observacionsZoho',
        'Observacions',
        'observacions'
      ) || ''
    )
  }, [deal])

  // ✅ Pax display robust (mostra també 0)
  const paxDisplay = useMemo(() => {
    const raw =
      get(
        deal,
        'NumPax',
        'numPax',
        'pax',
        'Num_Pax',
        'num_pax',
        'PAX'
      ) ?? editData.NumPax

    if (raw === 0) return '0'
    const s = String(raw ?? '').trim()
    return s
  }, [deal, editData.NumPax])

  // 🧩 Sincronitza el formulari quan canviï el deal
  useEffect(() => {
    const NomEventRaw = get(deal, 'NomEvent', 'nomEvent', 'summary') || ''
    const LN = get(deal, 'LN', 'ln', 'liniaNegoci') || 'Altres'
    const Servei =
      get(
        deal,
        'Servei',
        'servei',
        'service',
        'TipusServei',
        'tipusservei'
      ) || ''
    const Comercial =
      get(
        deal,
        'Comercial',
        'comercial',
        'responsable',
        'salesperson',
        'Salesperson'
      ) || ''
    const NumPax =
      get(
        deal,
        'NumPax',
        'numPax',
        'pax',
        'Num_Pax',
        'num_pax',
        'PAX'
      ) ?? ''
    const Ubicacio = get(deal, 'Ubicacio', 'ubicacio', 'location') || ''
    const Code = get(deal, 'code', 'C_digo', 'codi') || ''
    const DataInici =
      get(deal, 'DataInici', 'dataInici', 'Data', 'dateStart') || ''
    const DataFi = get(deal, 'DataFi', 'dataFi', 'dateEnd') || ''
    const HoraInici =
      get(deal, 'HoraInici', 'horaInici', 'Hora', 'hora') || ''
    const HoraFi = get(deal, 'HoraFi', 'horaFi') || ''

    console.log('📊 Extracte camps:', {
      NomEvent: deal.NomEvent,
      Comercial: deal.Comercial,
      Servei: deal.Servei,
      NumPax: deal.NumPax,
      LN: deal.LN,
      origen: deal.origen,
      collection: deal.collection,
      ObservacionsZoho: (deal as any)?.ObservacionsZoho,
    })

    const next = {
      LN,
      code: Code,
      NomEvent: NomEventRaw.split('/')[0].trim(),
      DataInici,
      DataFi,
      HoraInici,
      HoraFi,
      NumPax,
      Ubicacio,
      Servei,
      Comercial,
    }

    setEditData(next as any)
    setInitialData(next as any)
    setMultiDay(Boolean(DataFi && DataFi !== DataInici))
    setCodeDirty(false)
  }, [deal])

  // 🔄 Quan canviï el deal, carregar directament els adjunts estructurats
  useEffect(() => {
    const anyDeal = deal as any
    const nextFiles = Array.isArray(anyDeal?.files) ? anyDeal.files : []
    setFiles(nextFiles)
  }, [deal])

  // Helpers
  const handleChange = (field: string, value: string) => {
    if (field === 'DataInici') {
      setEditData((prev) => {
        const next = { ...prev, [field]: value }
        if (!multiDay) {
          next.DataFi = value
        }
        return next
      })
      return
    }
    if (field === 'code') {
      const prevCode = String(initialData?.code || '').trim()
      const nextCode = String(value || '').trim()
      if (prevCode !== nextCode) setCodeDirty(true)
    }
    setEditData((prev) => ({ ...prev, [field]: value }))
  }

  // 💾 Desa canvis generals de l’esdeveniment (sense tocar fitxers)
  const handleSave = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!canEdit) return

    try {
      const startDate = String(editData.DataInici || '').trim()
      const endDate = String(editData.DataFi || '').trim()
      if (startDate && endDate && endDate < startDate) {
        alert("❌ La data de fi no pot ser anterior a la data d'inici.")
        return
      }

      const prevCode = String(initialData?.code || '').trim()
      const nextCode = String(editData?.code || '').trim()
      const normalizedDataFi = multiDay
        ? endDate || startDate || null
        : startDate || null
      const payload: Record<string, any> = {
        ...editData,
        DataFi: normalizedDataFi,
        // 🔧 FIX: si ve buit, deixem null (igual que abans però més robust)
        NumPax:
          editData.NumPax === '' || editData.NumPax === null || editData.NumPax === undefined
            ? null
            : Number(editData.NumPax),
        collection: COLLECTION,
        updatedAt: new Date().toISOString(),
      }
      if (canEditCode && (codeDirty || prevCode !== nextCode)) {
        payload.codeConfirmed = Boolean(nextCode)
      }

      const res = await fetch(`/api/calendar/manual/${deal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Error desant dades')

      alert('✅ Canvis desats correctament')
      setOpen(false)
      onSaved?.()
      document.dispatchEvent(new CustomEvent('calendar:reload'))
    } catch (err) {
      console.error('❌ Error desant:', err)
      alert('❌ No s’han pogut desar els canvis.')
    }
  }

  // 🗑️ Eliminar un enllaç (fileN) de Firestore
  const handleDeleteFile = async (key: string) => {
    if (!canEdit) return
    if (!confirm('Vols eliminar aquest enllaç del document?')) return

    try {
      const payload: Record<string, any> = { collection: COLLECTION }
      payload[key] = null
      const res = await fetch(`/api/calendar/manual/${deal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Error eliminant l’enllaç')

      setFiles((prev) => prev.filter((f) => f.key !== key))
      alert('🗑️ Enllaç eliminat correctament')
      onSaved?.()
    } catch (err) {
      console.error('❌ Error eliminant enllaç:', err)
      alert('❌ No s’ha pogut eliminar l’enllaç.')
    }
  }

  // 🗑️ Elimina TOT l’esdeveniment
  const handleDeleteEvent = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!canEdit) return
    if (!confirm('Vols eliminar aquest esdeveniment?')) return

    try {
      const res = await fetch(
        `/api/calendar/manual/${deal.id}?collection=${COLLECTION}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Error eliminant')
      alert('🗑️ Esdeveniment eliminat correctament')
      setOpen(false)
      document.dispatchEvent(new CustomEvent('calendar:reload'))
      onSaved?.()
    } catch (err) {
      console.error('❌ Error eliminant:', err)
      alert('❌ No s’ha pogut eliminar l’esdeveniment.')
    }
  }

  // 🔁 Restaura canvis locals no desats
  const handleRestore = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!canEdit) return
    setEditData(initialData)
    alert('🔁 Canvis restaurats')
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

          /* 📱 Mòbil: modal fullscreen vertical */
          h-[92dvh]
          max-h-[92dvh]
          overflow-y-auto
          rounded-none
          pt-10

          /* 🖥 Desktop: modal centrat */
          sm:rounded-lg
          sm:h-auto
          sm:max-h-[85vh]
          sm:pt-6
        "
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {editData.NomEvent || 'Esdeveniment'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-gray-700">
        

          {/* 📝 Observacions Zoho */}
          {ObservacionsZoho && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <label className="block text-xs font-medium text-yellow-800 mb-1">
                Observacions (Zoho)
              </label>
              <p className="text-sm text-yellow-900 whitespace-pre-wrap">
                {ObservacionsZoho}
              </p>
            </div>
          )}

          {/* Línia de negoci */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Línia de negoci
            </label>
            {isManual && !readonly ? (
              <select
                value={editData.LN}
                onChange={(e) => handleChange('LN', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Empresa">Empresa</option>
                <option value="Casaments">Casaments</option>
                <option value="Grups Restaurants">Grups Restaurants</option>
                <option value="Foodlovers">Foodlovers</option>
                <option value="Agenda">Agenda</option>
                <option value="Altres">Altres</option>
              </select>
            ) : (
              <p>{get(deal, 'LN', 'ln') || editData.LN || '—'}</p>
            )}
          </div>

          {/* Nom */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom</label>
            {isManual && !readonly ? (
              <Input
                value={editData.NomEvent}
                onChange={(e) => handleChange('NomEvent', e.target.value)}
              />
            ) : (
              <p>{editData.NomEvent}</p>
            )}
          </div>

          {/* Codi */}
          {(isZohoVerd || isManual) && !readonly && canEditCode ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Codi</label>
              <Input
                value={editData.code}
                onChange={(e) => handleChange('code', e.target.value)}
                placeholder="Codi intern o de document"
              />
            </div>
          ) : (
            editData.code && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Codi</label>
                <p>{editData.code}</p>
              </div>
            )
          )}

          {/* Data inici */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Data</label>
            {(isManual || canEditStageVerd) && !readonly ? (
              <Input
                type="date"
                value={editData.DataInici}
                onChange={(e) => handleChange('DataInici', e.target.value)}
              />
            ) : (
              <p>{editData.DataInici}</p>
            )}
          </div>

          {/* Multi-dia + Data fi editable */}
          {(isManual || canEditStageVerd) && !readonly ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={multiDay}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setMultiDay(checked)
                    if (!checked) {
                      const start = String(editData.DataInici || '').trim()
                      setEditData((prev) => ({ ...prev, DataFi: start }))
                    }
                  }}
                  id={`calendar-multi-day-${deal.id}`}
                  className="w-4 h-4"
                />
                <label htmlFor={`calendar-multi-day-${deal.id}`} className="text-xs text-gray-600">
                  L'esdeveniment dura més d'un dia
                </label>
              </div>

              {multiDay ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data fi</label>
                  <Input
                    type="date"
                    value={editData.DataFi || ''}
                    min={editData.DataInici || undefined}
                    onChange={(e) => handleChange('DataFi', e.target.value)}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {/* Hora inici (manual o Zoho confirmat editable) */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hora inici</label>
            {(isManual || canEditStageVerd) && !readonly ? (
              <Input
                type="time"
                value={editData.HoraInici || ''}
                onChange={(e) => handleChange('HoraInici', e.target.value)}
              />
            ) : (
              <p>{editData.HoraInici || '—'}</p>
            )}
          </div>

          {/* Hora fi */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hora fi</label>
            {(isManual || canEditStageVerd) && !readonly ? (
              <Input
                type="time"
                value={editData.HoraFi || ''}
                onChange={(e) => handleChange('HoraFi', e.target.value)}
              />
            ) : (
              <p>{editData.HoraFi || '—'}</p>
            )}
          </div>

          {/* Data fi (només lectura si no es pot editar) */}
          {!((isManual || canEditStageVerd) && !readonly) &&
            editData.DataFi &&
            editData.DataFi !== editData.DataInici && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Data fi
              </label>
              <p>{editData.DataFi}</p>
            </div>
          )}

          {/* Ubicació */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ubicació</label>
            {isManual && !readonly ? (
              <SearchFincaInput
                value={editData.Ubicacio}
                onChange={(val) => {
                  console.log('Ubicació seleccionada:', val)
                  handleChange('Ubicacio', val)
                }}
              />
            ) : (
              <p>{editData.Ubicacio || '—'}</p>
            )}
          </div>

          {/* Servei */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Tipus de Servei
            </label>
            {isManual && !readonly ? (
              <SearchServeiInput
                value={editData.Servei}
                onChange={(val) => handleChange('Servei', val)}
              />
            ) : (
              <p>{editData.Servei || '—'}</p>
            )}
          </div>

          {/* Nombre de convidats */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Nombre de Pax
            </label>
            {isManual && !readonly ? (
              <div className="relative">
                <Input
                  type="number"
                  value={editData.NumPax as any}
                  onChange={(e) => handleChange('NumPax', e.target.value)}
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  Pax
                </span>
              </div>
            ) : (
              <p>{paxDisplay !== '' ? `${paxDisplay} Pax` : '—'}</p>
            )}
          </div>

          {/* Comercial */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Comercial</label>
            {isManual && !readonly ? (
              <select
                value={editData.Comercial}
                onChange={(e) => handleChange('Comercial', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                disabled={comercialLoading}
              >
                <option value="">
                  {comercialLoading ? 'Carregant...' : '-- Selecciona --'}
                </option>
                {comercialOptionsWithCurrent.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <p>{editData.Comercial || '—'}</p>
            )}
          </div>

          {/* 📎 Adjuntar fitxer des de SharePoint */}
          {canEdit && (
            <div className="pt-3 border-t mt-4 space-y-3">
              <label className="block text-xs text-gray-500 mb-2">
                📎 Documents de l’esdeveniment (SharePoint)
              </label>

              <div className="mt-2">
                <AttachFileButton
                  collection={COLLECTION}
                  docId={deal.id}
                  existingKeys={files.map((f) => f.key)}
                  onAdded={(att) => {
                    // afegeix utilitzant la clau retornada pel boto
                    setFiles((prev) => [...prev, { key: att.key, url: att.url }])
                  }}
                />
              </div>
            </div>
          )}

          {/* Llista de fitxers adjuntats */}
          <div className="border rounded-md p-2 bg-gray-50">
            {files.length === 0 ? (
              <p className="text-sm text-gray-400 text-center">
                No hi ha documents afegits
              </p>
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

                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 text-xs shrink-0"
                        onClick={() => handleDeleteFile(key)}
                      >
                        🗑️
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Botons d’acció */}
        <DialogFooter className="mt-4 flex flex-col gap-2">
          {canEdit && (
            <>
              <Button onClick={handleSave} className="w-full">
                💾 Desa canvis
              </Button>
              <Button onClick={handleRestore} variant="outline" className="w-full">
                🔄 Restaurar
              </Button>
              <Button
                onClick={handleDeleteEvent}
                variant="default"
                className="bg-red-600 hover:bg-red-700 text-white w-full"
              >
                🗑️ Eliminar esdeveniment
              </Button>
            </>
          )}

          {!canEdit && (
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
              Tancar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}






