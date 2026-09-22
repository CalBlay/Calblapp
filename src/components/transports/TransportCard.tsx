'use client'

import React, { useMemo, useState } from 'react'
import { Trash2, Edit2, Truck, FileText, AlertTriangle, Snowflake, Gauge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import type { Transport } from '@/hooks/useTransports'
import { TRANSPORT_TYPE_LABELS, type TransportTypeDefinition } from '@/lib/transportTypes'
import { getTachographReviewInfo } from '@/lib/transportTachograph'

interface Props {
  transport: Transport
  transportTypeDefinition?: TransportTypeDefinition
  driverName?: string | null
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
}

function formatDate(d?: string | null): string {
  if (!d) return '-'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '-'
  return dt.toLocaleDateString('ca-ES')
}

function formatKm(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${new Intl.NumberFormat('ca-ES', { maximumFractionDigits: 0 }).format(value)} km`
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

export function TransportCard({
  transport,
  transportTypeDefinition,
  driverName,
  onEdit,
  onDelete,
  canEdit,
}: Props) {
  const [available, setAvailable] = useState(transport.available)
  const today = useMemo(() => new Date(), [])
  const isLargeTruck =
    transportTypeDefinition?.requiresLargeTruckLicense ||
    transport.type === 'camioGran' ||
    transport.type === 'camioGranFred'
  const tachographRequired = transportTypeDefinition?.tachographRequired ?? isLargeTruck
  const tachographInfo = useMemo(
    () => getTachographReviewInfo(transport.tachographReviewDates || [], today),
    [today, transport.tachographReviewDates]
  )

  const handleToggle = async (newStatus: boolean) => {
    if (!canEdit) return
    setAvailable(newStatus)

    try {
      await fetch(`/api/transports/${transport.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: newStatus }),
      })
    } catch (err) {
      console.error('Error actualitzant disponibilitat:', err)
    }
  }

  const itvInfo = useMemo(() => {
    if (!transport.itvExpiry) {
      return {
        label: 'Sense data ITV',
        color: 'text-slate-500',
        badge: 'bg-slate-100 text-slate-700',
      }
    }

    const exp = new Date(transport.itvExpiry)
    if (Number.isNaN(exp.getTime())) {
      return {
        label: 'ITV invalida',
        color: 'text-red-600',
        badge: 'bg-red-100 text-red-700',
      }
    }

    const diffMs = exp.getTime() - today.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return {
        label: 'ITV caducada',
        color: 'text-red-600',
        badge: 'bg-red-100 text-red-700',
      }
    }

    if (diffDays <= 30) {
      return {
        label: `ITV caduca en ${diffDays} dies`,
        color: 'text-amber-600',
        badge: 'bg-amber-100 text-amber-700',
      }
    }

    return {
      label: `ITV vigent fins ${formatDate(transport.itvExpiry)}`,
      color: 'text-green-600',
      badge: 'bg-green-100 text-green-700',
    }
  }, [transport.itvExpiry, today])

  const latestMileage = useMemo(() => {
    if (!transport.monthlyMileage?.length) return null
    return transport.monthlyMileage.reduce<number | null>((maxKm, entry) => {
      if (typeof entry.km !== 'number' || !Number.isFinite(entry.km)) return maxKm
      return maxKm == null ? entry.km : Math.max(maxKm, entry.km)
    }, null)
  }, [transport.monthlyMileage])
  const serviceInfo = useMemo(() => {
    if (!transport.lastService) {
      return {
        label: 'Sense ultima revisio',
        color: 'text-slate-500',
      }
    }

    const lastServiceDate = new Date(transport.lastService)
    if (Number.isNaN(lastServiceDate.getTime())) {
      return {
        label: 'Data ultima revisio invalida',
        color: 'text-red-600',
      }
    }

    const annualDueDate = addYears(lastServiceDate, 1)
    const annualDiffDays = Math.round((annualDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const isLargeTruck = transport.type === 'camioGran' || transport.type === 'camioGranFred'
    const defaultKmThreshold =
      transportTypeDefinition?.serviceIntervalKm || (isLargeTruck ? 40000 : 20000)
    const lastServiceKm =
      typeof transport.lastServiceKm === 'number' && Number.isFinite(transport.lastServiceKm)
        ? transport.lastServiceKm
        : null
    const configuredNextServiceKm =
      typeof transport.nextServiceKm === 'number' &&
      Number.isFinite(transport.nextServiceKm) &&
      transport.nextServiceKm >= 0
        ? transport.nextServiceKm
        : null
    const effectiveNextServiceKm =
      typeof configuredNextServiceKm === 'number'
        ? configuredNextServiceKm
        : typeof lastServiceKm === 'number' && lastServiceKm >= 0
          ? lastServiceKm + defaultKmThreshold
          : null
    const serviceIntervalKm =
      typeof configuredNextServiceKm === 'number' &&
      typeof lastServiceKm === 'number' &&
      configuredNextServiceKm > lastServiceKm
        ? configuredNextServiceKm - lastServiceKm
        : defaultKmThreshold
    const kmRemaining =
      typeof latestMileage === 'number' && typeof effectiveNextServiceKm === 'number'
        ? effectiveNextServiceKm - latestMileage
        : null

    if (typeof kmRemaining === 'number' && kmRemaining <= 0) {
      return {
        label: `Revisio per km vencuda (${formatKm(Math.abs(kmRemaining))} excedits)`,
        color: 'text-red-600',
      }
    }

    if (annualDiffDays < 0) {
      return {
        label: 'Revisio anual vencuda',
        color: 'text-red-600',
      }
    }

    if (typeof kmRemaining === 'number' && kmRemaining <= Math.round(serviceIntervalKm * 0.1)) {
      return {
        label: `Revisio propera per km (${formatKm(kmRemaining)} restants)`,
        color: 'text-amber-600',
      }
    }

    if (annualDiffDays <= 30) {
      return {
        label: `Revisio anual en ${annualDiffDays} dies`,
        color: 'text-amber-600',
      }
    }

    return {
      label: 'Revisio al dia',
      color: 'text-green-600',
    }
  }, [latestMileage, today, transport.lastService, transport.lastServiceKm, transport.nextServiceKm, transport.type, transportTypeDefinition?.serviceIntervalKm])
  const documentsCount = transport.documents?.length ?? 0

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50">
            <Truck className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex flex-col">
            <h3 className="text-base font-bold tracking-tight">{transport.plate}</h3>
            <span className="text-xs text-slate-500">
              {transportTypeDefinition?.label || TRANSPORT_TYPE_LABELS[transport.type] || transport.type}
            </span>
          </div>
        </div>

        {canEdit ? (
          <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="hover:bg-orange-100"
            onClick={onEdit}
          >
            <Edit2 className="h-4 w-4 text-orange-600" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="hover:bg-red-100"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {driverName ? (
          <Badge variant="outline" className="border-green-700 text-green-700">
            {driverName}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-gray-300 text-gray-400">
            Sense conductor
          </Badge>
        )}

        <Badge className={itvInfo.badge}>
          <AlertTriangle className="mr-1 h-3 w-3" />
          {itvInfo.label}
        </Badge>

        {transport.refrigerated ? (
          <Badge
            variant="outline"
            className="border-sky-300 bg-sky-50 text-sky-700"
          >
            <Snowflake className="mr-1 h-3 w-3" />
            Fred
          </Badge>
        ) : null}

        {tachographRequired ? (
          <Badge
            variant="outline"
            className={
              tachographInfo.state === 'overdue'
                ? 'border-red-300 bg-red-50 text-red-700'
                : tachographInfo.state === 'upcoming'
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : tachographInfo.state === 'ok'
                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
            }
          >
            <Gauge className="mr-1 h-3 w-3" />
            {tachographInfo.state === 'overdue'
              ? 'Tacògraf vençut'
              : tachographInfo.state === 'upcoming'
                ? 'Tacògraf pròxim'
                : tachographInfo.state === 'ok'
                  ? 'Tacògraf vigent'
                  : 'Tacògraf sense dades'}
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            ITV
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-600">
              Data ITV: <span className="font-medium">{formatDate(transport.itvDate)}</span>
            </span>
            <span className={itvInfo.color}>
              Caducitat: <span className="font-medium">{formatDate(transport.itvExpiry)}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Revisio
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-600">
              Ultima: <span className="font-medium">{formatDate(transport.lastService)}</span>
            </span>
            <span className="text-slate-600">
              Km propera: <span className="font-medium">{formatKm(transport.nextServiceKm)}</span>
            </span>
            <span className={serviceInfo.color}>{serviceInfo.label}</span>
          </div>
        </div>

        {transport.refrigerated ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-sky-600">
              <Snowflake className="h-3 w-3" />
              Sistema de fred
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-600">
              <span>
                Revisió:{' '}
                <span className="font-medium">{formatDate(transport.refrigerationReviewDate)}</span>
              </span>
              <span>
                Caducitat:{' '}
                <span className="font-medium">{formatDate(transport.refrigerationExpiryDate)}</span>
              </span>
            </div>
          </div>
        ) : null}

        {tachographRequired ? (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-violet-600">
              <Gauge className="h-3 w-3" />
              Tacògraf
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-600">
              <span>
                Última: <span className="font-medium">{formatDate(tachographInfo.latestReviewDate)}</span>
              </span>
              <span>
                Pròxima: <span className="font-medium">{formatDate(tachographInfo.nextReviewDate)}</span>
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-2">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <FileText className="h-4 w-4 text-slate-500" />
          <span>
            {documentsCount === 0
              ? 'Sense documentacio'
              : `${documentsCount} document${documentsCount > 1 ? 's' : ''} adjunt${documentsCount > 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium ${
              available ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {available ? 'Disponible' : 'No disponible'}
          </span>
          {canEdit ? (
            <Switch
              checked={available}
              onCheckedChange={handleToggle}
              className={`${
                available
                  ? 'data-[state=checked]:bg-green-500'
                  : 'data-[state=unchecked]:bg-red-500'
              }`}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
