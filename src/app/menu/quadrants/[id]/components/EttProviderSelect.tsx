'use client'

import { Label } from '@/components/ui/label'
import type { EttProviderPremise } from '@/services/premises'
import { useId } from 'react'

type EttContactData = {
  ettProviderId: string
  ettProviderName: string
  ettResponsibleName: string
  ettEmail: string
}

export default function EttProviderSelect({
  providers,
  value,
  onChange,
}: {
  providers: EttProviderPremise[]
  value: EttContactData
  onChange: (patch: Partial<EttContactData>) => void
}) {
  const selectId = useId()
  return (
    <div className="space-y-1 lg:col-span-full">
      <Label htmlFor={selectId}>Empresa ETT i destinatari</Label>
      <select
        id={selectId}
        value={value.ettProviderId}
        onChange={(event) => {
          const provider = providers.find((item) => item.id === event.target.value)
          onChange({
            ettProviderId: provider?.id || '',
            ettProviderName: provider?.name || '',
            ettResponsibleName: provider?.responsibleName || '',
            ettEmail: provider?.email || '',
          })
        }}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      >
        <option value="">Selecciona una empresa ETT</option>
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.name} · {provider.responsibleName || provider.email} · {provider.email}
          </option>
        ))}
      </select>
      {value.ettProviderId ? (
        <p className="text-xs text-emerald-700">
          Els horaris s’enviaran a {value.ettResponsibleName || value.ettProviderName}: {value.ettEmail}
        </p>
      ) : (
        <p className="text-xs text-amber-700">
          Cal seleccionar una empresa abans d’enviar els horaris.
        </p>
      )}
    </div>
  )
}
