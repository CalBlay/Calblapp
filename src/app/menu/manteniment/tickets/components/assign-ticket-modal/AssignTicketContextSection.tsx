import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TicketPriority } from '../../types'

type Props = {
  showOriginLocationField: boolean
  locations: string[]
  detailsLocation: string
  setDetailsLocation: (value: string) => void
  machineLabel: string
  machinePlaceholder: string
  machinePickerOpen: boolean
  setMachinePickerOpen: (value: boolean) => void
  machineQuery: string
  setMachineQuery: (value: string) => void
  filteredMachineOptions: string[]
  detailsMachine: string
  setDetailsMachine: (value: string) => void
  detailsDescription: string
  setDetailsDescription: (value: string) => void
  detailsWorkLocation: string
  setDetailsWorkLocation: (value: string) => void
  detailsPriority: TicketPriority
  setDetailsPriority: (value: TicketPriority) => void
  isDeco: boolean
  isValidated: boolean
}

export default function AssignTicketContextSection({
  showOriginLocationField,
  locations,
  detailsLocation,
  setDetailsLocation,
  machineLabel,
  machinePlaceholder,
  machinePickerOpen,
  setMachinePickerOpen,
  machineQuery,
  setMachineQuery,
  filteredMachineOptions,
  detailsMachine,
  setDetailsMachine,
  detailsDescription,
  setDetailsDescription,
  detailsWorkLocation,
  setDetailsWorkLocation,
  detailsPriority,
  setDetailsPriority,
  isDeco,
  isValidated,
}: Props) {
  return (
    <div className="space-y-4">
      <div
        className={`grid grid-cols-1 gap-3 ${
          showOriginLocationField
            ? 'md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'
            : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'
        }`}
      >
        {showOriginLocationField ? (
          <label className="text-sm text-gray-700">
            Ubicacio origen
            <select
              className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
              value={detailsLocation}
              disabled={isValidated}
              onChange={(e) => setDetailsLocation(e.target.value)}
            >
              <option value="">Selecciona ubicacio</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm text-gray-700">
          {machineLabel}
          <Popover open={machinePickerOpen} onOpenChange={setMachinePickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={isValidated}
                className="mt-1.5 flex h-11 w-full items-center justify-between rounded-2xl border bg-white px-4 text-left text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="truncate">{detailsMachine || machinePlaceholder}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0">
              <div className="border-b px-3 py-2">
                <div className="flex items-center gap-2 rounded-xl border bg-white px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={machineQuery}
                    onChange={(e) => setMachineQuery(e.target.value)}
                    placeholder={`Cerca ${isDeco ? 'material' : 'maquinaria'}...`}
                    className="h-10 w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailsMachine('')
                    setMachinePickerOpen(false)
                    setMachineQuery('')
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>{machinePlaceholder}</span>
                  {!detailsMachine ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                </button>
                {filteredMachineOptions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">Cap resultat</div>
                ) : (
                  filteredMachineOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setDetailsMachine(option)
                        setMachinePickerOpen(false)
                        setMachineQuery('')
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="truncate">{option}</span>
                      {detailsMachine === option ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        </label>
        <label className="block text-sm text-gray-700">
          Titol per a l'operari
          <input
            type="text"
            className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
            value={detailsDescription}
            disabled={isValidated}
            onChange={(e) => setDetailsDescription(e.target.value)}
            placeholder="Resumeix la feina de forma clara"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block text-sm text-gray-700">
          Ubicacio de la feina
          <select
            className="mt-1.5 h-11 w-full rounded-2xl border bg-white px-4 text-base"
            value={detailsWorkLocation}
            disabled={isValidated}
            onChange={(e) => setDetailsWorkLocation(e.target.value)}
          >
            <option value="">Mateixa ubicacio d'origen</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className="text-sm text-gray-500">Importancia</span>
          {(['urgent', 'alta', 'normal', 'baixa'] as TicketPriority[]).map((key) => (
            <button
              key={key}
              type="button"
              disabled={isValidated}
              onClick={() => setDetailsPriority(key)}
              className={`min-h-[34px] rounded-full border px-3 text-xs font-semibold transition ${
                detailsPriority === key
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {key === 'urgent' ? 'Urgent' : key === 'alta' ? 'Alta' : key === 'normal' ? 'Normal' : 'Baixa'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
