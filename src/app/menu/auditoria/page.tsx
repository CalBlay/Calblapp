'use client'

import Link from 'next/link'
import { FileText, Search, BarChart3 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import { getVisibleModules } from '@/lib/accessControl'

type HubCardConfig = {
  label: string
  className: string
  Icon: typeof FileText
}

export default function AuditoriaHubPage() {
  const { data: session } = useSession()
  const user = session?.user

  const auditoriaModule = getVisibleModules({
    role: user?.role,
    department: user?.department,
  }).find((m) => m.path === '/menu/auditoria')

  const submodules = auditoriaModule?.submodules ?? []

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-none p-4 space-y-4">
        <ModuleHeader subtitle="Gestio del cicle d'auditories" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {submodules.map((sub) => {
            const key = sub.path.split('/').pop() || ''
            const map: Record<string, HubCardConfig> = {
              plantilles: {
                label: 'Plantilles',
                className: 'from-cyan-50 to-teal-100 text-cyan-800',
                Icon: FileText,
              },
              valoracio: {
                label: 'Avaluacio',
                className: 'from-amber-50 to-yellow-100 text-amber-800',
                Icon: BarChart3,
              },
              consulta: {
                label: 'Consulta',
                className: 'from-slate-50 to-gray-100 text-slate-800',
                Icon: Search,
              },
            }
            const item = map[key]
            if (!item) return null
            const Icon = item.Icon

            return (
              <Link
                key={sub.path}
                href={sub.path}
                className={`border rounded-2xl p-4 hover:shadow-sm bg-gradient-to-br ${item.className}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white shadow flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold">{item.label}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {!submodules.length && (
          <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">
            No tens submoduls d'auditoria visibles amb el teu perfil.
          </div>
        )}

      </div>
    </RoleGuard>
  )
}
