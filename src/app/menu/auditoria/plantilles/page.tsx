'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { useAuditTemplates } from '@/hooks/auditoria/useAuditTemplates'
import type { AuditDepartment, AuditTemplatePreview } from '@/types/auditoria'
import { normalizeRole } from '@/lib/roles'
import { resolveAuditDepartmentForUser } from '@/lib/auditDepartment'

const DEFAULT_TEMPLATE_NAME = 'Escriure nom de la nova plantilla'

type DepartmentMeta = {
  id: AuditDepartment
  label: string
}

const DEPARTMENTS: DepartmentMeta[] = [
  { id: 'comercial', label: 'Comercial' },
  { id: 'serveis', label: 'Serveis' },
  { id: 'cuina', label: 'Cuina' },
  { id: 'logistica', label: 'Logistica' },
  { id: 'deco', label: 'Deco' },
]

type StatusFilter = 'all' | 'draft' | 'active' | 'visible'
type VisibilityFilter = 'all' | 'visible' | 'not_visible'

const normalizeText = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export default function AuditoriaPlantillesPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const userRole = normalizeRole((session?.user as any)?.role || '')
  const userDepartment = resolveAuditDepartmentForUser((session?.user as any)?.department || '')
  const forcedDepartment = userRole === 'cap' ? userDepartment : null
  const initialDepartment: AuditDepartment = forcedDepartment || 'comercial'

  const { templates, loading, error, createTemplate, reload } = useAuditTemplates({
    department: forcedDepartment,
  })
  const [activeDepartment, setActiveDepartment] = useState<AuditDepartment>(initialDepartment)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [visibilityBusyId, setVisibilityBusyId] = useState<string | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all')

  const visibleDepartments = useMemo(
    () =>
      forcedDepartment
        ? DEPARTMENTS.filter((dept) => dept.id === forcedDepartment)
        : DEPARTMENTS,
    [forcedDepartment]
  )

  React.useEffect(() => {
    if (forcedDepartment && activeDepartment !== forcedDepartment) {
      setActiveDepartment(forcedDepartment)
    }
  }, [forcedDepartment, activeDepartment])

  const filteredTemplates = useMemo(() => {
    const q = normalizeText(searchQuery)

    return templates
      .filter((tpl) => tpl.department === activeDepartment)
      .filter((tpl) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'visible') return tpl.isVisible
        return tpl.status === statusFilter
      })
      .filter((tpl) => {
        if (visibilityFilter === 'all') return true
        if (visibilityFilter === 'visible') return tpl.isVisible
        return !tpl.isVisible
      })
      .filter((tpl) => {
        if (!q) return true
        const statusLabel = tpl.isVisible ? 'visible' : tpl.status === 'active' ? 'activa' : 'esborrany'
        const haystack = normalizeText(`${tpl.name} ${tpl.updatedAt} ${tpl.blocks} ${statusLabel}`)
        return haystack.includes(q)
      })
  }, [templates, activeDepartment, searchQuery, statusFilter, visibilityFilter])

  const handleCreateAndOpen = async () => {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const draftName = DEFAULT_TEMPLATE_NAME
      const id = await createTemplate({ name: draftName, department: activeDepartment })
      if (!id) throw new Error('No s ha pogut obtenir l identificador de la plantilla')
      router.push(`/menu/auditoria/plantilles/${id}/editar`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'No s ha pogut crear la plantilla')
    } finally {
      setCreating(false)
    }
  }

  const handleSetVisible = async (template: AuditTemplatePreview) => {
    if (template.isVisible || template.status !== 'active' || visibilityBusyId) return
    setVisibilityBusyId(template.id)
    setCreateError(null)
    try {
      const res = await fetch(`/api/auditoria/templates/${template.id}/visibility`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut canviar la visibilitat'))
      reload()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error canviant visibilitat')
    } finally {
      setVisibilityBusyId(null)
    }
  }

  const handleDeleteTemplate = async (template: AuditTemplatePreview) => {
    if (deleteBusyId) return
    const ok = window.confirm(`Vols eliminar la plantilla "${template.name}"?`)
    if (!ok) return

    setDeleteBusyId(template.id)
    setCreateError(null)
    try {
      const res = await fetch(`/api/auditoria/templates/${template.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut eliminar la plantilla'))
      reload()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Error eliminant plantilla')
    } finally {
      setDeleteBusyId(null)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-6xl mx-auto p-3 sm:p-4 space-y-4">
        <ModuleHeader subtitle="Plantilles" />

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Plantilles d'auditoria</h2>
              <p className="text-sm text-gray-600">Consulta i creacio.</p>
            </div>
          </div>
          {createError && <div className="text-sm text-red-600">{createError}</div>}

          {visibleDepartments.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleDepartments.map((dept) => {
                const isActive = activeDepartment === dept.id
                return (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => setActiveDepartment(dept.id)}
                    className={[
                      'rounded-lg border px-3 py-1.5 text-sm whitespace-nowrap',
                      isActive
                        ? 'border-cyan-300 bg-cyan-50 text-cyan-800'
                        : 'border-gray-200 text-gray-700',
                    ].join(' ')}
                  >
                    {dept.label}
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_170px_170px_auto]">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar plantilla..."
                className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-cyan-400"
              />
            </div>

            <div className="relative">
              <SlidersHorizontal className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-cyan-400"
              >
                <option value="all">Estat: Tots</option>
                <option value="draft">Esborrany</option>
                <option value="active">Activa</option>
                <option value="visible">Visible</option>
              </select>
            </div>

            <div className="relative">
              <Eye className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
                className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-cyan-400"
              >
                <option value="all">Visibilitat: Totes</option>
                <option value="visible">Nomes visibles</option>
                <option value="not_visible">No visibles</option>
              </select>
            </div>

            <button
              type="button"
              title="Netejar filtres"
              onClick={() => {
                setSearchQuery('')
                setStatusFilter('all')
                setVisibilityFilter('all')
              }}
              className="h-10 w-10 rounded-xl border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
          </div>

          <TemplatesList
            templates={filteredTemplates}
            loading={loading}
            error={error}
            onSetVisible={handleSetVisible}
            visibilityBusyId={visibilityBusyId}
            onDeleteTemplate={handleDeleteTemplate}
            deleteBusyId={deleteBusyId}
          />
        </Card>
        <FloatingAddButton onClick={handleCreateAndOpen} className={creating ? 'opacity-70' : ''} />
      </div>
    </RoleGuard>
  )
}

function TemplatesList({
  templates,
  loading,
  error,
  onSetVisible,
  visibilityBusyId,
  onDeleteTemplate,
  deleteBusyId,
}: {
  templates: AuditTemplatePreview[]
  loading: boolean
  error: string | null
  onSetVisible: (template: AuditTemplatePreview) => Promise<void>
  visibilityBusyId: string | null
  onDeleteTemplate: (template: AuditTemplatePreview) => Promise<void>
  deleteBusyId: string | null
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
        Carregant plantilles...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error carregant plantilles: {error}
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600">
        Encara no hi ha plantilles per aquest departament. Crea la primera plantilla per comencar.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {templates.map((tpl) => (
        <Link
          key={tpl.id}
          href={`/menu/auditoria/plantilles/${tpl.id}`}
          className="rounded-xl border bg-white p-3 flex items-center justify-between hover:bg-gray-50 transition"
        >
          <div>
            <div className="text-sm font-medium text-gray-900">{tpl.name}</div>
            <div className="text-xs text-gray-600">
              {tpl.blocks} blocs - Actualitzada {tpl.updatedAt}
            </div>
          </div>
          <div className="grid grid-cols-[36px_36px_96px] items-center gap-2 justify-items-center">
            <button
              type="button"
              title={tpl.isVisible ? 'Visible a auditories' : 'Marcar com visible'}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSetVisible(tpl)
              }}
              disabled={tpl.status !== 'active' || tpl.isVisible || visibilityBusyId === tpl.id}
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-md border',
                tpl.isVisible
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-red-300 bg-red-50 text-red-600',
                tpl.status !== 'active' ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Eliminar plantilla"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDeleteTemplate(tpl)
              }}
              disabled={deleteBusyId === tpl.id}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <span
              className={[
                'inline-flex h-8 w-24 items-center justify-center text-xs rounded-full',
                tpl.isVisible
                  ? 'bg-cyan-100 text-cyan-700'
                  : tpl.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700',
              ].join(' ')}
            >
              {tpl.isVisible ? 'Visible' : tpl.status === 'active' ? 'Activa' : 'Esborrany'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
