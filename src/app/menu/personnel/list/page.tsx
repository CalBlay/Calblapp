// file: src/app/menu/personnel/list/page.tsx
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import PersonnelList from '@/components/personnel/PersonnelList'
import NewPersonnelModal from '@/components/personnel/NewPersonnelModal'
import EditPersonnelModal from '@/components/personnel/EditPersonnelModal'
import FloatingAddButton from '@/components/ui/floating-add-button'
import FilterButton from '@/components/ui/filter-button'
import PersonnelFilters from '@/components/personnel/PersonnelFilters'
import { usePersonnel, Personnel } from '@/hooks/usePersonnel'
import { useFilters } from '@/context/FiltersContext'
import ModuleHeader from '@/components/layout/ModuleHeader'
import ExportMenu from '@/components/export/ExportMenu'
import { Users } from 'lucide-react'
import * as XLSX from 'xlsx'
import UserRequestResultsList from '@/components/users/UserRequestResultsList'
import { RoleGuard } from '@/lib/withRoleGuard'

type SessionUser = {
  department?: string
}

export default function PersonnelListPage() {
  const { data: session } = useSession()
  const { data: allPersonnel = [], isLoading, isError, refetch } = usePersonnel()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Personnel | null>(null)

  // ðŸ” Cerca
  const [searchTerm, setSearchTerm] = useState('')

  // ðŸŽ› Estat dels filtres del slide-over
  const [filters, setFilters] = useState({
    roleType: '',
    isDriver: 'all' as 'all' | 'yes' | 'no',
    department: ''
  })

  // SlideOver global: injectar els filtres de Personal
  const { setContent, setOpen } = useFilters()


  useEffect(() => {
    setContent(
      <PersonnelFilters 
        filters={filters}
        onFiltersChange={setFilters}
      />
    )
  }, [filters, setContent])

  // ðŸ§® FILTRAT FINAL
  const filteredPersonnel = useMemo(() => {
    const term = searchTerm.toLowerCase()

    return allPersonnel.filter((p) => {

      // ðŸ” Filtre per nom
      if (!p.name?.toLowerCase().includes(term)) return false

      // ðŸ”¹ Filtre per rol
      if (filters.roleType && p.role?.toLowerCase() !== filters.roleType)
        return false

      // ðŸ”¹ Filtre per conductor
   const isDriver = p.driver?.isDriver ?? false

if (filters.isDriver !== 'all') {
  if (filters.isDriver === 'yes' && !isDriver) return false
  if (filters.isDriver === 'no'  &&  isDriver) return false
}


      // ðŸ”¹ Filtre per departament
      if (filters.department && p.department?.toLowerCase() !== filters.department)
        return false

      return true
    })
  }, [allPersonnel, searchTerm, filters])

  const exportRows = useMemo(
    () =>
      filteredPersonnel.map((p) => ({
        Nom: p.name || '',
        Rol: p.role || '',
        Departament: p.department || '',
        Conductor: p.driver?.isDriver ? 'Sí' : 'No',
        Jamonero: p.isJamonero ? 'Sí' : 'No',
        Contacte: p.email || '',
      })),
    [filteredPersonnel]
  )

  if (isLoading) return <p>Carregant personal…</p>
  if (isError) return <p className="text-red-600">Error carregant personal.</p>

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const cols = ['Nom', 'Rol', 'Departament', 'Conductor', 'Jamonero', 'Contacte']
    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((col) => `<td>${escapeHtml(row[col as keyof typeof row] ?? '')}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>Llista de personal</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f3f4f6; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Llista de personal</h1>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Personal')
    XLSX.writeFile(wb, 'personal.xlsx')
  }

  const handleExportPdfView = () => {
    window.print()
  }

  const handleExportPdfTable = () => {
    const html = buildPdfTableHtml()
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel },
    { label: 'PDF (vista)', onClick: handleExportPdfView },
    { label: 'PDF (taula)', onClick: handleExportPdfTable },
  ]

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
    <section className="p-0 space-y-4">
      <ModuleHeader
        icon={<Users className="h-7 w-7 text-indigo-600" />}
        title="Personal"
        subtitle="Gestió de persones i rols"
        actions={<ExportMenu items={exportItems} />}
      />

      {/* Respostes a sol·licituds (caps/admin) */}
      <div className="px-4 pt-4">
        <UserRequestResultsList onAfterAction={refetch} />
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #personnel-print-root, #personnel-print-root * { visibility: visible; }
          #personnel-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* ðŸ” Barra de cerca */}
<div className="px-1 pt-2 flex items-center gap-2 relative z-40">



  
  {/* ðŸ” Input de cerca */}
  <input
    type="text"
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    placeholder="Cerca per nom..."
    className="flex-1 h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm"
  />

  {/* ðŸŽ› BotÃ³ de filtres (mateix estil que Events/Torns) */}
  <FilterButton onClick={() => setOpen(true)} />

</div>


      {/* ðŸ“‹ Llista de personal */}
      <div className="p-6" id="personnel-print-root">
        <PersonnelList
          personnel={filteredPersonnel}
          mutate={refetch}
          onEdit={setEditingPerson}
        />
      </div>

      {/* âž• Crear nou */}
      <NewPersonnelModal
        isOpen={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={() => {
          refetch()
          setModalOpen(false)
        }}
        defaultDepartment={(session?.user as SessionUser)?.department}
      />

      {/* âœï¸ Editar */}
      {editingPerson && (
        <EditPersonnelModal
          isOpen={true}
          onOpenChange={() => setEditingPerson(null)}
          onSaved={() => {
            refetch()
            setEditingPerson(null)
          }}
          person={editingPerson}
        />
      )}

      {/* âž• BotÃ³ flotant â€œAfegir nouâ€ */}
      <FloatingAddButton onClick={() => setModalOpen(true)} />

    </section>
    </RoleGuard>
  )
}


