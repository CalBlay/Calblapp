'use client'

import { FileText, Search, BarChart3 } from 'lucide-react'
import { useSession } from 'next-auth/react'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import { RoleGuard } from '@/lib/withRoleGuard'
import { getVisibleModules } from '@/lib/accessControl'

const AUDIT_CARD_MAP = {
  plantilles: {
    title: 'Plantilles',
    description: 'Models i configuració',
    icon: FileText,
    tone: 'cyan',
  },
  valoracio: {
    title: 'Avaluació',
    description: "Valoració d'auditories",
    icon: BarChart3,
    tone: 'amber',
  },
  consulta: {
    title: 'Consulta',
    description: "Exploració d'execucions",
    icon: Search,
    tone: 'slate',
  },
} as const

export default function AuditoriaHubPage() {
  const { data: session } = useSession()
  const user = session?.user

  const auditoriaModule = getVisibleModules({
    role: user?.role,
    department: user?.department,
  }).find((m) => m.path === '/menu/auditoria')

  const submodules = auditoriaModule?.submodules ?? []
  const cards: ModuleHubCard[] = submodules.flatMap((sub) => {
    const key = sub.path.split('/').pop() || ''
    const item = AUDIT_CARD_MAP[key as keyof typeof AUDIT_CARD_MAP]

    return item
      ? [
          {
            href: sub.path,
            title: item.title,
            description: item.description,
            icon: item.icon,
            tone: item.tone,
          },
        ]
      : []
  })

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <ModuleHub
        subtitle="Gestio del cicle d'auditories"
        cards={cards}
        emptyMessage="No tens submoduls d'auditoria visibles amb el teu perfil."
      />
    </RoleGuard>
  )
}
