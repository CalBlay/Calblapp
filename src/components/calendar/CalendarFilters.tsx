// file: src/components/calendar/CalendarFilters.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
import ResetFilterButton from '@/components/ui/ResetFilterButton'

export type CalendarStage = 'all' | 'confirmat' | 'pressupost' | 'calentet'
export type CalendarCodeStatus = 'all' | 'missing' | 'review' | 'confirmed'

export type CalendarLN =
  | 'all'
  | 'empresa'
  | 'casaments'
  | 'grups restaurants'
  | 'foodlovers'
  | 'agenda'
  | 'altres'

export interface CalendarFilterChange {
  ln?: CalendarLN[]
  stage?: CalendarStage
  commercial?: string[]
  location?: string[]
  codeStatus?: CalendarCodeStatus
}

export interface CalendarFiltersProps {
  ln?: CalendarLN[] | CalendarLN | string
  stage?: CalendarStage | string
  commercial?: string[] | string
  location?: string[] | string
  codeStatus?: CalendarCodeStatus | string
  showCodeStatus?: boolean
  comercialOptions?: string[]
  locationOptions?: string[]
  onChange: (f: CalendarFilterChange) => void
  onReset?: () => void
}

const LN_OPTIONS: { label: string; value: CalendarLN }[] = [
  { label: 'Totes', value: 'all' },
  { label: 'Empresa', value: 'empresa' },
  { label: 'Casaments', value: 'casaments' },
  { label: 'Grups Restaurants', value: 'grups restaurants' },
  { label: 'Foodlovers', value: 'foodlovers' },
  { label: 'Agenda', value: 'agenda' },
  { label: 'Altres', value: 'altres' },
]

const STAGE_OPTIONS: { label: string; value: CalendarStage }[] = [
  { label: 'Tots', value: 'all' },
  { label: 'Confirmats', value: 'confirmat' },
  { label: 'Pressupost enviat', value: 'pressupost' },
  { label: 'Prereserva / Calentet', value: 'calentet' },
]

const CODE_STATUS_OPTIONS: { label: string; value: CalendarCodeStatus }[] = [
  { label: 'Tots', value: 'all' },
  { label: 'Sense codi', value: 'missing' },
  { label: 'A revisar', value: 'review' },
  { label: 'Confirmats', value: 'confirmed' },
]

const normalize = (v = '') =>
  v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function coerceAll(v?: string) {
  const n = normalize(v || '')
  if (!n) return 'all'
  if (n === 'all') return 'all'
  if (n.startsWith('tots') || n.startsWith('totes')) return 'all'
  return v || 'all'
}

function toArray(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim())
      .filter((v) => coerceAll(v) !== 'all')
    const sameLength = normalized.length === value.length
    const sameValues =
      sameLength && normalized.every((v, i) => v === value[i])
    return sameValues ? value : normalized
  }
  const single = String(value || '').trim()
  if (!single) return []
  if (coerceAll(single) === 'all') return []
  return [single]
}

export default function CalendarFilters({
  ln: lnProp,
  stage: stageProp,
  commercial: commercialProp,
  location: locationProp,
  codeStatus: codeStatusProp,
  showCodeStatus,
  comercialOptions,
  locationOptions,
  onChange,
  onReset,
}: CalendarFiltersProps) {
  const [lnValues, setLnValues] = useState<CalendarLN[]>(() =>
    toArray(lnProp) as CalendarLN[]
  )
  const [stage, setStage] = useState<CalendarStage>(() => coerceAll(String(stageProp || 'all')) as CalendarStage)
  const [commercialValues, setCommercialValues] = useState<string[]>(() =>
    toArray(commercialProp)
  )
  const [locationValues, setLocationValues] = useState<string[]>(() =>
    toArray(locationProp)
  )
  const [codeStatus, setCodeStatus] = useState<CalendarCodeStatus>(() =>
    coerceAll(String(codeStatusProp || 'all')) as CalendarCodeStatus
  )

  const showCommercial = useMemo(
    () => Array.isArray(comercialOptions) && comercialOptions.length > 0,
    [comercialOptions]
  )

  const [initialized, setInitialized] = useState(false)

  // Si la pagina canvia valors (ex: reset), sincronitza aqui
  useEffect(() => setLnValues(toArray(lnProp) as CalendarLN[]), [lnProp])
  useEffect(() => setStage(coerceAll(String(stageProp || 'all')) as CalendarStage), [stageProp])
  useEffect(() => setCommercialValues(toArray(commercialProp)), [commercialProp])
  useEffect(() => setLocationValues(toArray(locationProp)), [locationProp])
  useEffect(
    () =>
      setCodeStatus(
        coerceAll(String(codeStatusProp || 'all')) as CalendarCodeStatus
      ),
    [codeStatusProp]
  )
  const showLocation = useMemo(
    () => Array.isArray(locationOptions) && locationOptions.length > 0,
    [locationOptions]
  )

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      return
    }
    onChange({
      ln: lnValues,
      stage,
      commercial: commercialValues,
      location: locationValues,
      codeStatus,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lnValues, stage, commercialValues, locationValues, codeStatus])

  const resetAll = () => {
    setLnValues([])
    setStage('all')
    setCommercialValues([])
    setLocationValues([])
    setCodeStatus('all')
    onReset?.()
  }

  const lnOptions = LN_OPTIONS.filter((o) => o.value !== 'all')

  const toggleLn = (value: CalendarLN) => {
    if (value === 'all') {
      setLnValues([])
      return
    }
    setLnValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  const toggleCommercial = (value: string) => {
    if (value === 'all') {
      setCommercialValues([])
      return
    }
    setCommercialValues((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    )
  }

  const toggleLocation = (value: string) => {
    if (value === 'all') {
      setLocationValues([])
      return
    }
    setLocationValues((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    )
  }

  return (
    <div className="flex flex-col gap-4 w-full p-3">
      {/* LN */}
      <div>
        <label className="text-[11px] text-gray-500">Linia de negoci</label>
        <div className="mt-1 rounded-md border bg-white p-2 space-y-2 max-h-40 overflow-y-auto">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lnValues.length === 0}
              onChange={() => toggleLn('all')}
            />
            Totes
          </label>
          {lnOptions.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lnValues.includes(o.value)}
                onChange={() => toggleLn(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      {/* Stage */}
      <div>
        <label className="text-[11px] text-gray-500">Estat</label>
        <Select value={stage} onValueChange={(v) => setStage(v as CalendarStage)}>
          <SelectTrigger className="w-full h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Codi */}
      {showCodeStatus && (
        <div>
          <label className="text-[11px] text-gray-500">Codi</label>
          <Select
            value={codeStatus}
            onValueChange={(v) => setCodeStatus(v as CalendarCodeStatus)}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CODE_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {/* Comercial (opcional) */}
      {showCommercial && (
        <div>
          <label className="text-[11px] text-gray-500">Comercial</label>
          <div className="mt-1 rounded-md border bg-white p-2 space-y-2 max-h-48 overflow-y-auto">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={commercialValues.length === 0}
                onChange={() => toggleCommercial('all')}
              />
              Tots
            </label>
            {comercialOptions!.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={commercialValues.includes(c)}
                  onChange={() => toggleCommercial(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Ubicacio (opcional) */}
      {showLocation && (
        <div>
          <label className="text-[11px] text-gray-500">Ubicació</label>
          <div className="mt-1 max-h-48 space-y-2 overflow-y-auto rounded-md border bg-white p-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={locationValues.length === 0}
                onChange={() => toggleLocation('all')}
              />
              Totes
            </label>
            {locationOptions!.map((location) => (
              <label key={location} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={locationValues.includes(location)}
                  onChange={() => toggleLocation(location)}
                />
                {location}
              </label>
            ))}
          </div>
        </div>
      )}

      {onReset && <ResetFilterButton onClick={resetAll} />}
    </div>
  )
}
