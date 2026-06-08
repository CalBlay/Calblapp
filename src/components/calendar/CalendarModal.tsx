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
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'

interface Props {
  deal: Deal
  trigger?: React.ReactNode
  onSaved?: () => void
  readonly?: boolean
  embedded?: boolean
  onEmbeddedClose?: () => void
  onRequestPanel?: (deal: Deal) => void
  onBack?: () => void
  backLabel?: string
}

type ComercialCandidate = {
  name: string
  departmentBucket: string
}

type SessionUserShape = {
  role?: string
  department?: string
  name?: string
  commercialName?: string
}

type CalendarEditData = {
  LN: string
  code: string
  NomEvent: string
  DataInici: string
  DataFi: string
  HoraInici: string
  HoraFi: string
  NumPax: number | string | null
  Ubicacio: string
  Servei: string
  Comercial: string
  ComercialIntern: string
  Responsable: string
}

type CalendarDealRecord = Deal & Record<string, unknown>

const toCalendarPax = (value: unknown): number | string | null => {
  if (typeof value === 'number' || typeof value === 'string') return value
  return ''
}

const normalizeLoose = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const normalizeDept = (value?: string | null) => {
  const base = normalizeLoose(value)
  const compact = base.replace(/\s+/g, '')
  if (compact === 'foodlover' || compact === 'foodlovers') return 'foodlovers'
  if (compact === 'grupsrestaurants') return 'grups restaurants'
  return base
}

function bindTriggerClick(
  trigger: React.ReactNode,
  onTrigger: (e: React.MouseEvent) => void
) {
  if (!React.isValidElement(trigger)) return trigger
  const child = trigger as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  const prevOnClick = child.props.onClick
  return React.cloneElement(child, {
    onClick: (e: React.MouseEvent) => {
      prevOnClick?.(e)
      onTrigger(e)
    },
  })
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

/**
 * CalendarModal (consulta i enllaços SharePoint)
 * - No puja fitxers. Guarda enllaços (file1, file2, ...)
 * - Llista enllaços guardats i permet obrir-los / eliminar-los
 * - Manté l’edició de camps bàsics si l’esdeveniment és Confirmat o manual
 */
export default function CalendarModal({
  deal,
  trigger,
  onSaved,
  readonly,
  embedded = false,
  onEmbeddedClose,
  onRequestPanel,
  onBack,
  backLabel = 'Tornar',
}: Props) {
  const dealRecord = deal as CalendarDealRecord
  const { data: session } = useSession()
  const { uiEdit, uiActions, ready: permsReady } = useUiPermissions()
  const [open, setOpen] = useState(false)
  const [preferPanel, setPreferPanel] = useState(
    () =>
      typeof window !== 'undefined' &&
      Boolean(onRequestPanel) &&
      window.innerWidth >= 1024
  )

  useEffect(() => {
    if (!onRequestPanel) {
      setPreferPanel(false)
      return
    }
    const update = () => setPreferPanel(window.innerWidth >= 1024)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [onRequestPanel])

  useEffect(() => {
    if (preferPanel && open) setOpen(false)
  }, [preferPanel, open])
  const [comercialPool, setComercialPool] = useState<ComercialCandidate[]>([])
  const [comercialLoading, setComercialLoading] = useState(false)
  const [codeDirty, setCodeDirty] = useState(false)

  // Helper per recuperar camps sense importar majúscules/minúscules
  const get = (obj: Record<string, unknown> | null | undefined, ...keys: string[]) => {
    if (!obj) return undefined
    for (const k of keys) {
      const foundKey = Object.keys(obj).find(
        (key) => key.toLowerCase() === k.toLowerCase()
      )
      if (foundKey) return obj[foundKey]
    }
    return undefined
  }

  // ✅ Dades del formulari de l’esdeveniment (estat inicial)
  const [editData, setEditData] = useState<CalendarEditData>(() => ({
    // 🔧 FIX: abans hi havia get('ev.code'...) amb string literal. Ara és get(deal,...)
    LN: String(get(dealRecord, 'LN', 'ln', 'liniaNegoci') || 'Altres'),
    code: String(get(dealRecord, 'code', 'codi', 'eventcode', 'codigo', 'C_digo') || ''),
    NomEvent: String(get(dealRecord, 'NomEvent', 'nomEvent', 'summary') || ''),
    DataInici: String(get(dealRecord, 'DataInici', 'dataInici', 'Data', 'dateStart') || ''),
    DataFi: String(get(dealRecord, 'DataFi', 'dataFi', 'dateEnd') || ''),
    HoraInici: String(get(dealRecord, 'HoraInici', 'horaInici', 'Hora', 'hora') || ''),
    HoraFi: String(get(dealRecord, 'HoraFi', 'horaFi') || ''),
    NumPax: toCalendarPax(get(dealRecord, 'NumPax', 'numPax', 'pax')),
    Ubicacio: String(get(dealRecord, 'Ubicacio', 'ubicacio', 'location') || ''),
    Servei: String(get(dealRecord, 'Servei', 'servei', 'service') || ''),
    Comercial: String(get(dealRecord, 'Comercial', 'comercial') || ''),
    ComercialIntern: String(
      get(dealRecord, 'ComercialIntern', 'comercialIntern', 'Comercial_Interna') || ''
    ),
    Responsable: String(get(dealRecord, 'Responsable', 'responsable') || ''),
  }))

  // Guarda una còpia per poder fer reset si cal
  const [initialData, setInitialData] = useState(editData)

  // Fitxers (file1, file2, ...) llegits del deal
  const [files, setFiles] = useState<
    Array<{ key: string; url: string; name?: string; source?: string }>
  >([])
  const [multiDay, setMultiDay] = useState(false)

  // Només editable si és Confirmat o manual (respectant readonly si ve informat)
  const isZohoVerd =
    ['verd', 'stage_verd'].includes(String(deal?.collection || '')) &&
    deal.origen === 'zoho'
  const isManual = deal.origen !== 'zoho'

  const sessionUser = (session?.user ?? null) as SessionUserShape | null
  const role = normalizeLoose(sessionUser?.role)
  const department = normalizeDept(sessionUser?.department)
  const sessionName = String(sessionUser?.name || '').trim()
  const sessionCommercialName = String(sessionUser?.commercialName || '').trim()
  const isAdmin = role === 'admin'
  const isDireccio = role === 'direccio' || role === 'direccion'
  const isProduccio = department === 'produccio'
  const isComercial = department === 'comercial'
  const isComercialRole = role === 'comercial'
  const isCap = role.includes('cap')
  const isCapProduccio = isCap && department === 'produccio'
  const isProductionOperationalWorker = role === 'treballador' && department === 'produccio'
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

  const calendarPath = '/menu/calendar'
  const permCalendarEdit = uiEdit[calendarPath] === true
  const baseCanEdit = !readonly && (canEditStageVerd || canEditManual)
  const canUpdate = useMemo(() => {
    if (!permsReady) return true
    return (
      permCalendarEdit ||
      uiActions[PERM.action(calendarPath, 'manual:update')] === true
    )
  }, [permsReady, uiActions, permCalendarEdit])
  const canAttach = useMemo(() => {
    if (!permsReady) return true
    return (
      permCalendarEdit ||
      uiActions[PERM.action(calendarPath, 'attach:sharepoint')] === true
    )
  }, [permsReady, uiActions, permCalendarEdit])
  const canDeleteManual = useMemo(() => {
    if (!permsReady) return true
    return uiActions[PERM.action(calendarPath, 'manual:delete')] === true
  }, [permsReady, uiActions])

  const canEdit = useMemo(() => {
    if (!permsReady) return baseCanEdit
    if (uiEdit[calendarPath] === false) return false
    if (permCalendarEdit && !readonly && (isManual || isZohoVerd)) return true
    return baseCanEdit && canUpdate
  }, [permsReady, uiEdit, baseCanEdit, canUpdate, permCalendarEdit, isManual, isZohoVerd, readonly])
  const isOwnCommercialEvent = useMemo(() => {
    if (!isComercialRole) return false
    const eventCommercial = normalizeLoose(editData.Comercial)
    if (!eventCommercial) return false
    const aliases = [sessionCommercialName, sessionName].map(normalizeLoose).filter(Boolean)
    return aliases.includes(eventCommercial)
  }, [editData.Comercial, isComercialRole, sessionCommercialName, sessionName])
  const canEditCode =
    !readonly && (isZohoVerd || isManual) && (isAdmin || isProduccio || isOwnCommercialEvent)
  const canEditComercialIntern =
    !readonly && (isZohoVerd || isManual) && (isAdmin || isCapProduccio)
  const canManageDocuments = !readonly && canAttach && (canEdit || isOwnCommercialEvent)
  const canSave = (canEdit || canEditCode || canEditComercialIntern) && canUpdate
  const canDeleteEvent = canEdit && canDeleteManual && !isProductionOperationalWorker

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
      (n) => normalizeLoose(n) === normalizeLoose(current)
    )
    return exists ? filteredComercialOptions : [current, ...filteredComercialOptions]
  }, [filteredComercialOptions, editData.Comercial])

  const isActive = embedded || open

  useEffect(() => {
    if (!isActive) return
    if (comercialPool.length > 0) return

    let active = true
    const load = async () => {
      try {
        setComercialLoading(true)
        const res = await fetch('/api/users?view=commercial-options')
        const data = await res.json()
        if (!Array.isArray(data)) return

        const candidates: ComercialCandidate[] = data
          .filter((u: { role?: string }) => {
            const roleRaw = u?.role ?? ''
            const r = normalizeLoose(String(roleRaw))
            return (
              r === 'comercial' ||
              r === 'cap' ||
              r === 'cap departament' ||
              r === 'capdepartament'
            )
          })
          .map((u: { name?: string; department?: string }) => ({
            name: String(u?.name || '').trim(),
            departmentBucket: normalizeDeptForLnBucket(u?.department),
          }))
          .filter((candidate) => candidate.name.length > 0)

        const uniq = Array.from(
          new Map<string, ComercialCandidate>(
            candidates.map((candidate) => [normalizeLoose(candidate.name), candidate])
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
  }, [isActive, comercialPool.length])

  // Col·lecció: sempre guardem a stage_verd (segons decisió)
  const COLLECTION = 'stage_verd' as const

  // 📝 Observacions Zoho (read-only)
  const ObservacionsZoho = useMemo(() => {
    return String(
      get(
        dealRecord,
        'ObservacionsZoho',
        'observacionsZoho',
        'Observacions',
        'observacions'
      ) || ''
    )
  }, [dealRecord])

  // ✅ Pax display robust (mostra també 0)
  const paxDisplay = useMemo(() => {
    const raw =
      get(
        dealRecord,
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
  }, [dealRecord, editData.NumPax])

  // 🧩 Sincronitza el formulari quan canviï el deal
  useEffect(() => {
    const NomEventRaw = String(get(dealRecord, 'NomEvent', 'nomEvent', 'summary') || '')
    const LN = String(get(dealRecord, 'LN', 'ln', 'liniaNegoci') || 'Altres')
    const Servei =
      String(get(
        dealRecord,
        'Servei',
        'servei',
        'service',
        'TipusServei',
        'tipusservei'
      ) || '')
    const Comercial =
      String(get(
        dealRecord,
        'Comercial',
        'comercial',
        'salesperson',
        'Salesperson'
      ) || '')
    const ComercialIntern = String(
      get(dealRecord, 'ComercialIntern', 'comercialIntern', 'Comercial_Interna') || ''
    )
    const Responsable =
      String(get(dealRecord, 'Responsable', 'responsable', 'ResponsableZoho') || '')
    const NumPax = toCalendarPax(
      get(
        dealRecord,
        'NumPax',
        'numPax',
        'pax',
        'Num_Pax',
        'num_pax',
        'PAX'
      )
    )
    const Ubicacio = String(get(dealRecord, 'Ubicacio', 'ubicacio', 'location') || '')
    const Code = String(get(dealRecord, 'code', 'C_digo', 'codi') || '')
    const DataInici =
      String(get(dealRecord, 'DataInici', 'dataInici', 'Data', 'dateStart') || '')
    const DataFi = String(get(dealRecord, 'DataFi', 'dataFi', 'dateEnd') || '')
    const HoraInici =
      String(get(dealRecord, 'HoraInici', 'horaInici', 'Hora', 'hora') || '')
    const HoraFi = String(get(dealRecord, 'HoraFi', 'horaFi') || '')

    console.log('📊 Extracte camps:', {
      NomEvent: dealRecord.NomEvent,
      Comercial: dealRecord.Comercial,
      Servei: dealRecord.Servei,
      NumPax: dealRecord.NumPax,
      LN: dealRecord.LN,
      origen: dealRecord.origen,
      collection: dealRecord.collection,
      ObservacionsZoho: dealRecord?.ObservacionsZoho,
    })

    const next: CalendarEditData = {
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
      ComercialIntern,
      Responsable,
    }

    setEditData(next)
    setInitialData(next)
    setMultiDay(Boolean(DataFi && DataFi !== DataInici))
    setCodeDirty(false)
  }, [dealRecord])

  // 🔄 Quan canviï el deal, carregar directament els adjunts estructurats
  useEffect(() => {
    const nextFiles = Array.isArray(dealRecord?.files) ? dealRecord.files : []
    setFiles(nextFiles)
  }, [dealRecord])

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
    if (!canSave) return

    try {
      const startDate = String(editData.DataInici || '').trim()
      const endDate = String(editData.DataFi || '').trim()
      if (canEdit && startDate && endDate && endDate < startDate) {
        alert("❌ La data de fi no pot ser anterior a la data d'inici.")
        return
      }

      const prevCode = String(initialData?.code || '').trim()
      const nextCode = String(editData?.code || '').trim()
      const normalizedDataFi = multiDay
        ? endDate || startDate || null
        : startDate || null
      const payload: Record<string, unknown> = {
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
      if (!canEdit) {
        Object.keys(payload).forEach((key) => {
          if (
            ![
              'code',
              'ComercialIntern',
              'collection',
              'updatedAt',
            ].includes(key)
          ) {
            delete payload[key]
          }
        })
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
    if (!canManageDocuments) return
    const target = files.find((f) => f.key === key)
    if (String(target?.source || '').startsWith('zoho')) {
      alert('Aquest document ve de Zoho i no es pot eliminar manualment des del calendari.')
      return
    }
    if (!confirm('Vols eliminar aquest enllaç del document?')) return

    try {
      const payload: Record<string, unknown> = { collection: COLLECTION }
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
    if (!canDeleteEvent) return
    if (!confirm('Vols eliminar aquest esdeveniment?')) return

    try {
      const res = await fetch(
        `/api/calendar/manual/${deal.id}?collection=${COLLECTION}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Error eliminant')
      alert('🗑️ Esdeveniment eliminat correctament')
      handleClose()
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

  const handleClose = () => {
    if (embedded) onEmbeddedClose?.()
    else setOpen(false)
  }

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const usePanel =
      Boolean(onRequestPanel) &&
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024
    if (usePanel && onRequestPanel) {
      onRequestPanel(deal)
      return
    }
    setOpen(true)
  }

  const title = editData.NomEvent || 'Esdeveniment'

  const body = (
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
            {canEdit ? (
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
              <p>{String(get(dealRecord, 'LN', 'ln') || editData.LN || '—')}</p>
            )}
          </div>

          {/* Nom */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom</label>
            {canEdit ? (
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
            {canEdit ? (
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
            {canEdit ? (
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
            {canEdit ? (
              <div className="relative">
                <Input
                  type="number"
                  value={editData.NumPax ?? ''}
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

          {/* Comercial (propietari oportunitat / venda — Zoho Owner) */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Comercial
              <span className="text-gray-400 font-normal"> (oportunitat)</span>
            </label>
            {canEdit ? (
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

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Comercial intern
              <span className="text-gray-400 font-normal"> (Zoho)</span>
            </label>
            {canEditComercialIntern ? (
              <Input
                value={editData.ComercialIntern}
                onChange={(e) => handleChange('ComercialIntern', e.target.value)}
                placeholder="Nom del comercial intern"
              />
            ) : (
              <p>{editData.ComercialIntern || '—'}</p>
            )}
          </div>

          {/* Responsable (seguiment operatiu — Zoho Responsable) */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Responsable
              <span className="text-gray-400 font-normal"> (seguiment)</span>
            </label>
            {canEdit ? (
              <Input
                value={editData.Responsable}
                onChange={(e) => handleChange('Responsable', e.target.value)}
                placeholder="Nom del responsable de seguiment"
              />
            ) : (
              <p>{editData.Responsable || '—'}</p>
            )}
          </div>

          {/* 📎 Adjuntar fitxer des de SharePoint */}
          {canManageDocuments && (
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
                      {files.find((f) => f.key === key)?.name ||
                        decodeURIComponent(url.split('/').pop() || url)}
                    </a>

                    {canManageDocuments &&
                      !String(files.find((f) => f.key === key)?.source || '').startsWith('zoho') && (
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
  )

  const footer = (
        <div className="mt-4 flex flex-col gap-2">
          {canSave && (
            <>
              <Button onClick={handleSave} className="w-full">
                💾 Desa canvis
              </Button>
              {canEdit && (
                <Button onClick={handleRestore} variant="outline" className="w-full">
                  🔄 Restaurar
                </Button>
              )}
              {canDeleteEvent && (
                <Button
                  onClick={handleDeleteEvent}
                  variant="default"
                  className="bg-red-600 hover:bg-red-700 text-white w-full"
                >
                  🗑️ Eliminar esdeveniment
                </Button>
              )}
            </>
          )}

          {!canSave && (
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Tancar
            </Button>
          )}
        </div>
  )

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-white">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mb-1 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                ← {backLabel}
              </button>
            )}
            <h2 className="truncate text-base font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Tancar detall"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
        <div className="shrink-0 border-t px-4 py-3">{footer}</div>
      </div>
    )
  }

  if (preferPanel && onRequestPanel && trigger) {
    return bindTriggerClick(trigger, handleTriggerClick)
  }

  return (
    <Dialog modal={false} open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>
          {bindTriggerClick(trigger, handleTriggerClick)}
        </DialogTrigger>
      ) : null}

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
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        </DialogHeader>

        {body}

        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}






