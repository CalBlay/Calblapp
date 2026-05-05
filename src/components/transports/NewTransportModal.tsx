'use client'

import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateTransport } from '@/hooks/useCreateTransport'
import { usePersonnel } from '@/hooks/usePersonnel'
import type { Transport, TransportMonthlyMileageEntry } from '@/hooks/useTransports'
import { storage } from '@/lib/firebaseClient'
import {
  TRANSPORT_TYPE_OPTIONS,
  type TransportType,
} from '@/lib/transportTypes'
import { compressRasterImageForUpload, DEFAULT_MAX_IMAGE_UPLOAD_BYTES } from '@/lib/file-optimization'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const isTransportType = (value: string): value is TransportType =>
  TRANSPORT_TYPE_OPTIONS.some((option) => option.value === value)

interface NewTransportModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
  defaultValues?: Transport | null
}

type TransportDocument = {
  id: string
  name: string
  url: string
  uploadedAt: string
}

type TransportPayload = {
  plate: string
  type: TransportType
  conductorId: string | null
  itvDate?: string | null
  itvExpiry?: string | null
  lastService?: string | null
  lastServiceKm?: number | null
  nextService?: string | null
  documents: TransportDocument[]
  monthlyMileage: TransportMonthlyMileageEntry[]
}

const MONTH_OPTIONS = [
  { value: '01', label: 'Gen' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Des' },
] as const

const CURRENT_YEAR = new Date().getFullYear()

function addOneYear(dateValue: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return ''
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setFullYear(date.getFullYear() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function NewTransportModal({
  isOpen,
  onOpenChange,
  onCreated,
  defaultValues = null,
}: NewTransportModalProps) {
  const { mutateAsync, loading, error } = useCreateTransport()
  const { data: personnel } = usePersonnel()
  const isEditMode = !!defaultValues

  const [plate, setPlate] = useState('')
  const [type, setType] = useState<TransportType>('comercial')
  const [conductorId, setConductorId] = useState('')
  const [itvDate, setItvDate] = useState('')
  const [itvExpiry, setItvExpiry] = useState('')
  const [lastService, setLastService] = useState('')
  const [lastServiceKm, setLastServiceKm] = useState('')
  const [nextService, setNextService] = useState('')
  const [documents, setDocuments] = useState<TransportDocument[]>([])
  const [selectedMileageYear, setSelectedMileageYear] = useState(String(CURRENT_YEAR))
  const [monthlyMileage, setMonthlyMileage] = useState<TransportMonthlyMileageEntry[]>([])
  const [isMileageExpanded, setIsMileageExpanded] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    if (isEditMode && defaultValues) {
      const existingMileage = Array.isArray(defaultValues.monthlyMileage)
        ? [...defaultValues.monthlyMileage].sort((a, b) => a.month.localeCompare(b.month))
        : []
      const initialYear =
        existingMileage.length > 0
          ? existingMileage[existingMileage.length - 1]?.month.slice(0, 4) || String(CURRENT_YEAR)
          : String(CURRENT_YEAR)
      setPlate(defaultValues.plate || '')
      setType(defaultValues.type || 'comercial')
      setConductorId(defaultValues.conductorId || '')
      setItvDate(defaultValues.itvDate || '')
      setItvExpiry(defaultValues.itvExpiry || '')
      setLastService(defaultValues.lastService || '')
      setLastServiceKm(
        typeof defaultValues.lastServiceKm === 'number' && Number.isFinite(defaultValues.lastServiceKm)
          ? String(defaultValues.lastServiceKm)
          : ''
      )
      setNextService(defaultValues.nextService || '')
      setDocuments(defaultValues.documents || [])
      setMonthlyMileage(existingMileage)
      setSelectedMileageYear(initialYear)
      setIsMileageExpanded(existingMileage.length > 0)
      return
    }

    setPlate('')
    setType('comercial')
    setConductorId('')
    setItvDate('')
    setItvExpiry('')
    setLastService('')
    setLastServiceKm('')
    setNextService('')
    setDocuments([])
    setMonthlyMileage([])
    setSelectedMileageYear(String(CURRENT_YEAR))
    setIsMileageExpanded(false)
  }, [defaultValues, isEditMode, isOpen])

  useEffect(() => {
    if (!isOpen || !lastService) return
    const suggestedNextService = addOneYear(lastService)
    if (!suggestedNextService) return
    if (!nextService || nextService <= lastService) {
      setNextService(suggestedNextService)
    }
  }, [isOpen, lastService, nextService])

  const availableDrivers = useMemo(() => {
    if (!personnel) return []

    return personnel.filter((person) => {
      if (!person.driver) return false
      if (type === 'camioGran' || type === 'camioGranFred') {
        return person.driver.camioGran === true
      }
      return person.driver.camioPetit === true
    })
  }, [personnel, type])

  const mileageYearOptions = useMemo(() => {
    const years = new Set<string>([String(CURRENT_YEAR)])
    monthlyMileage.forEach((entry) => {
      const year = String(entry.month || '').slice(0, 4)
      if (/^\d{4}$/.test(year)) years.add(year)
    })
    return Array.from(years).sort((a, b) => Number(b) - Number(a))
  }, [monthlyMileage])

  const monthlyMileageMap = useMemo(() => {
    const map = new Map<string, TransportMonthlyMileageEntry>()
    monthlyMileage.forEach((entry) => {
      map.set(entry.month, entry)
    })
    return map
  }, [monthlyMileage])

  const handleOpenFileDialog = () => {
    fileInputRef.current?.click()
  }

  const handleFilesSelected = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files?.length) return

    const now = new Date().toISOString()

    for (const file of Array.from(files)) {
      const validTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/jpg',
        'image/webp',
      ]
      if (!validTypes.includes(file.type)) {
        alert(`Tipus de fitxer no permes: ${file.name}`)
        continue
      }

      let fileToUpload = file
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await compressRasterImageForUpload(file, DEFAULT_MAX_IMAGE_UPLOAD_BYTES)
        } catch {
          alert(`No s ha pogut optimitzar la imatge ${file.name}.`)
          continue
        }
        if (fileToUpload.size > DEFAULT_MAX_IMAGE_UPLOAD_BYTES) {
          alert(`La imatge ${file.name} encara supera 1MB despres de comprimir.`)
          continue
        }
      } else if (file.size > 5 * 1024 * 1024) {
        alert(`El fitxer ${file.name} supera els 5MB.`)
        continue
      }

      try {
        const safePlate = plate || defaultValues?.plate || 'sense-matricula'
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const storageName = fileToUpload.name || file.name
        const storagePath = `transports/${safePlate}/${id}-${storageName}`
        const fileRef = ref(storage, storagePath)

        await uploadBytes(fileRef, fileToUpload)
        const url = await getDownloadURL(fileRef)

        setDocuments((prev) => [
          ...prev,
          { id, name: storageName, url, uploadedAt: now },
        ])
      } catch (err) {
        console.error('Error pujant document:', err)
        alert(`No s'ha pogut pujar el fitxer ${file.name}.`)
      }
    }

    event.target.value = ''
  }

  const handleRemoveDocument = async (doc: TransportDocument) => {
    if (!window.confirm(`Vols eliminar el document "${doc.name}"?`)) return
    setDocuments((prev) => prev.filter((item) => item.id !== doc.id))
  }

  const handleMileageChange = (monthValue: string, rawValue: string) => {
    const monthKey = `${selectedMileageYear}-${monthValue}`
    setMonthlyMileage((prev) => {
      const next = prev.filter((entry) => entry.month !== monthKey)
      const trimmed = rawValue.trim()
      if (!trimmed) return next.sort((a, b) => a.month.localeCompare(b.month))

      const km = Number(trimmed)
      if (!Number.isFinite(km) || km < 0) return prev

      return [
        ...next,
        {
          month: monthKey,
          km,
          updatedAt: new Date().toISOString(),
        },
      ].sort((a, b) => a.month.localeCompare(b.month))
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const payload: TransportPayload = {
      plate: plate.trim(),
      type,
      conductorId: conductorId || null,
      itvDate: itvDate || null,
      itvExpiry: itvExpiry || null,
      lastService: lastService || null,
      lastServiceKm:
        lastServiceKm.trim() !== '' && Number.isFinite(Number(lastServiceKm)) && Number(lastServiceKm) >= 0
          ? Number(lastServiceKm)
          : null,
      nextService: nextService || null,
      documents,
      monthlyMileage,
    }

    try {
      if (isEditMode && defaultValues?.id) {
        const res = await fetch(`/api/transports/${defaultValues.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('Error actualitzant transport')
      } else {
        await mutateAsync(payload)
      }

      onCreated()
      onOpenChange(false)
    } catch (err) {
      console.error('Error desant transport:', err)
      alert("No s'ha pogut desar el vehicle.")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl" lockDismissOnOutside>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isEditMode ? 'Editar transport' : 'Nou transport'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="plate">Matricula</Label>
              <Input
                id="plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ex: 7447 MHX"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Tipus de vehicle</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => {
                  const value = e.target.value
                  if (isTransportType(value)) setType(value)
                }}
                className="w-full rounded-md border px-2 py-2 text-sm"
              >
                {TRANSPORT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 lg:col-span-1">
              <Label htmlFor="conductorId">Conductor (opcional)</Label>
              <select
                id="conductorId"
                value={conductorId}
                onChange={(e) => setConductorId(e.target.value)}
                className="w-full rounded-md border px-2 py-2 text-sm"
              >
                <option value="">- Sense conductor assignat -</option>
                {availableDrivers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              ITV
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="itvDate">Data ITV</Label>
                <Input
                  id="itvDate"
                  type="date"
                  value={itvDate}
                  onChange={(e) => setItvDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="itvExpiry">Caducitat ITV</Label>
                <Input
                  id="itvExpiry"
                  type="date"
                  value={itvExpiry}
                  onChange={(e) => setItvExpiry(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Revisio
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lastService">Ultima revisio</Label>
                <Input
                  id="lastService"
                  type="date"
                  value={lastService}
                  onChange={(e) => setLastService(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nextService">Propera revisio</Label>
                <Input
                  id="nextService"
                  type="date"
                  value={nextService}
                  onChange={(e) => setNextService(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="lastServiceKm">Km ultima revisio</Label>
                <Input
                  id="lastServiceKm"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={lastServiceKm}
                  onChange={(e) => setLastServiceKm(e.target.value)}
                  placeholder="Ex: 128540"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <button
              type="button"
              onClick={() => setIsMileageExpanded((prev) => !prev)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Quilometratge mensual
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Introdueix el km acumulat que marca el vehicle cada mes.
                </p>
              </div>
              <ChevronDown
                className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                  isMileageExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isMileageExpanded ? (
              <>
                <div className="w-full sm:w-28">
                  <Label htmlFor="mileageYear" className="text-xs text-slate-500">
                    Any
                  </Label>
                  <select
                    id="mileageYear"
                    value={selectedMileageYear}
                    onChange={(e) => setSelectedMileageYear(e.target.value)}
                    className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  >
                    {mileageYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                  {MONTH_OPTIONS.map((month) => {
                    const monthKey = `${selectedMileageYear}-${month.value}`
                    const currentEntry = monthlyMileageMap.get(monthKey)
                    return (
                      <div key={monthKey} className="space-y-1.5 rounded-lg border bg-white p-2">
                        <Label htmlFor={`mileage-${monthKey}`} className="text-xs text-slate-600">
                          {month.label}
                        </Label>
                        <Input
                          id={`mileage-${monthKey}`}
                          type="number"
                          min="0"
                          step="1"
                          inputMode="numeric"
                          value={currentEntry ? String(currentEntry.km) : ''}
                          onChange={(e) => handleMileageChange(month.value, e.target.value)}
                          placeholder="Km"
                        />
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Documentacio del vehicle
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenFileDialog}
              >
                Adjuntar document
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,image/*"
                className="hidden"
                onChange={handleFilesSelected}
              />
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-500">
                Encara no hi ha cap document adjunt.
              </p>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
                {documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-white px-2 py-1.5"
                  >
                    <div className="flex flex-col">
                      <span className="max-w-[180px] truncate font-medium">
                        {doc.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(doc.uploadedAt).toLocaleDateString('ca-ES')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Obrir
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(doc)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading
                ? 'Desant...'
                : isEditMode
                ? 'Desar canvis'
                : 'Afegir transport'}
            </Button>
          </div>

          {error && <p className="text-sm text-red-600">{String(error)}</p>}
        </form>
      </DialogContent>
    </Dialog>
  )
}
