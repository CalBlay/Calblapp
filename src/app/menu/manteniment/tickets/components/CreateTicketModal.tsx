import type { MachineItem, TicketPriority, TicketType } from '../types'

type Props = {
  locations: string[]
  machines: MachineItem[]
  createPriority: TicketPriority
  setCreatePriority: (value: TicketPriority) => void
  createTicketType: TicketType
  setCreateTicketType: (value: TicketType) => void
  locationQuery: string
  setLocationQuery: (value: string) => void
  createLocation: string
  setCreateLocation: (value: string) => void
  machineQuery: string
  setMachineQuery: (value: string) => void
  createMachine: string
  setCreateMachine: (value: string) => void
  createDescription: string
  setCreateDescription: (value: string) => void
  showLocationList: boolean
  setShowLocationList: (value: boolean) => void
  showMachineList: boolean
  setShowMachineList: (value: boolean) => void
  priorityLabels: Record<TicketPriority, string>
  ticketTypeLabels: Record<TicketType, string>
  showTicketTypeSelector?: boolean
  onClose: () => void
  onCreate: () => void
  createBusy: boolean
  onImageChange: (file: File | null) => void
  imageError: string | null
  imagePreview?: string | null
}

export default function CreateTicketModal({
  locations,
  machines,
  createPriority,
  setCreatePriority,
  createTicketType,
  setCreateTicketType,
  locationQuery,
  setLocationQuery,
  createLocation,
  setCreateLocation,
  machineQuery,
  setMachineQuery,
  createMachine,
  setCreateMachine,
  createDescription,
  setCreateDescription,
  showLocationList,
  setShowLocationList,
  showMachineList,
  setShowMachineList,
  priorityLabels,
  ticketTypeLabels,
  showTicketTypeSelector = true,
  onClose,
  onCreate,
  createBusy,
  onImageChange,
  imageError,
  imagePreview,
}: Props) {
  const isDeco = createTicketType === 'deco'
  const machinePlaceholder = isDeco ? 'Cerca material...' : 'Cerca maquinaria...'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4"
      onClick={() => {
        setShowLocationList(false)
        setShowMachineList(false)
      }}
    >
      <div
        className="w-full max-w-2xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-3">
              <h2 className="text-xl font-semibold text-slate-900">Nou ticket</h2>
              <div className="flex flex-wrap gap-2">
                {(['urgent', 'alta', 'normal', 'baixa'] as TicketPriority[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCreatePriority(key)}
                    className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
                      createPriority === key
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-gray-200 bg-gray-100 text-gray-800'
                    }`}
                  >
                    {priorityLabels[key]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-slate-200 text-lg text-gray-500"
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-5 md:px-6">
          {showTicketTypeSelector && (
            <div className="flex flex-wrap gap-2">
              {(['maquinaria', 'deco'] as TicketType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCreateTicketType(key)}
                  className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
                    createTicketType === key
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-gray-200 bg-gray-100 text-gray-800'
                  }`}
                >
                  {ticketTypeLabels[key]}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative">
              <input
                className="h-12 w-full rounded-2xl border px-4 pr-10 text-base"
                placeholder="Cerca ubicacio..."
                value={locationQuery}
                onFocus={() => setShowLocationList(true)}
                onChange={(e) => {
                  setLocationQuery(e.target.value)
                  setCreateLocation('')
                  setShowLocationList(true)
                }}
              />
              {locationQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setLocationQuery('')
                    setCreateLocation('')
                    setShowLocationList(false)
                  }}
                  className="absolute right-3 top-3 text-base text-gray-400 hover:text-gray-600"
                  aria-label="Esborrar"
                >
                  ×
                </button>
              )}
              {showLocationList && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-2xl border bg-white shadow">
                  {locations
                    .filter((loc) => loc.toLowerCase().includes(locationQuery.toLowerCase()))
                    .map((loc) => (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => {
                          setCreateLocation(loc)
                          setLocationQuery(loc)
                          setShowLocationList(false)
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        {loc}
                      </button>
                    ))}
                  {locations.filter((loc) => loc.toLowerCase().includes(locationQuery.toLowerCase()))
                    .length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500">Sense resultats</div>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <input
                className="h-12 w-full rounded-2xl border px-4 pr-10 text-base"
                placeholder={machinePlaceholder}
                value={machineQuery}
                onFocus={() => setShowMachineList(true)}
                onChange={(e) => {
                  setMachineQuery(e.target.value)
                  setCreateMachine('')
                  setShowMachineList(true)
                }}
              />
              {machineQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setMachineQuery('')
                    setCreateMachine('')
                    setShowMachineList(false)
                  }}
                  className="absolute right-3 top-3 text-base text-gray-400 hover:text-gray-600"
                  aria-label="Esborrar"
                >
                  ×
                </button>
              )}
              {showMachineList && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-2xl border bg-white shadow">
                  {machines
                    .filter((m) => m.label.toLowerCase().includes(machineQuery.toLowerCase()))
                    .map((m) => (
                      <button
                        key={m.code + m.name}
                        type="button"
                        onClick={() => {
                          setCreateMachine(m.label)
                          setMachineQuery(m.label)
                          setShowMachineList(false)
                        }}
                        className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        {m.label}
                      </button>
                    ))}
                  {machines.filter((m) => m.label.toLowerCase().includes(machineQuery.toLowerCase()))
                    .length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500">Sense resultats</div>
                  )}
                </div>
              )}
              {machines.length === 0 && !isDeco && (
                <div className="mt-1 text-xs text-amber-600">No s'ha pogut carregar la maquinaria.</div>
              )}
            </div>
          </div>

          <textarea
            className="min-h-[140px] w-full rounded-2xl border px-4 py-3 text-base"
            placeholder="Que s'ha d'arreglar?"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
          />

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-gray-500">Adjuntar</label>
              <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                Fitxer
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onImageChange(e.target.files?.[0] || null)}
                />
              </label>
              <label className="min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm">
                Foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onImageChange(e.target.files?.[0] || null)}
                />
              </label>
              {imageError && <span className="text-sm text-red-600">{imageError}</span>}
            </div>

            {imagePreview && (
              <img
                src={imagePreview}
                alt="Previsualitzacio"
                className="max-h-56 w-full rounded-2xl object-cover"
              />
            )}
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:justify-end md:px-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-full border px-5 text-sm font-medium"
          >
            Cancel·lar
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={createBusy}
            className="min-h-[48px] rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white"
          >
            {createBusy ? 'Desant...' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
