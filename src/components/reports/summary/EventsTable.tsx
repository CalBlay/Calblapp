// file: src/components/reports/summary/EventsTable.tsx
export type EventRow = {
  id: string
  name: string
  ln: string
  commercial: string
  serviceType: string
  pax: number
  location: string
}

export function EventsTable({ data }: { data: EventRow[] }) {
  const rows = [...data].sort((a, b) => b.pax - a.pax)

  return (
    <div className="rounded-lg border bg-white">
      <div className="px-4 py-3 border-b">
        <p className="font-semibold text-gray-800">Esdeveniments (resum)</p>
      </div>

      <div className="md:hidden space-y-3 p-3">
        {rows.length === 0 && (
          <div className="text-center text-gray-500 text-sm border rounded-lg py-3">Sense dades en el rang seleccionat.</div>
        )}
        {rows.map(row => (
          <div key={row.id} className="border rounded-lg p-3 text-sm">
            <div className="font-semibold text-gray-800">{row.name}</div>
            <div className="text-gray-600">
              {row.ln || '—'} {row.commercial ? `· ${row.commercial}` : ''} {row.serviceType ? `· ${row.serviceType}` : ''}
            </div>
            <div className="text-gray-600">{row.location || 'Sense ubicació'}</div>
            <div className="flex justify-between text-gray-800 mt-1">
              <span>Pax</span>
              <span>{row.pax}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto hidden md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left">Esdeveniment</th>
              <th className="px-4 py-2 text-left">LN</th>
              <th className="px-4 py-2 text-left">Comercial</th>
              <th className="px-4 py-2 text-left">Servei</th>
              <th className="px-4 py-2 text-right">Pax</th>
              <th className="px-4 py-2 text-left">Ubicació</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-3 text-center text-gray-500">
                  Sense dades en el rang seleccionat.
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2">{row.ln || '—'}</td>
                <td className="px-4 py-2">{row.commercial || '—'}</td>
                <td className="px-4 py-2">{row.serviceType || '—'}</td>
                <td className="px-4 py-2 text-right">{row.pax}</td>
                <td className="px-4 py-2">{row.location || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
