'use client'

import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import ModuleHub, { type ModuleHubCard } from '@/components/layout/ModuleHub'
import { Calculator, Settings2, PencilLine, BarChart3, Building2 } from 'lucide-react'
import { getVisibleModules, MODULES } from '@/lib/accessControl'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const CARD_MAP = {
  configuracio: {
    title: 'Configuració',
    description: '€/h, punts de sortida i combustible',
    icon: Settings2,
    tone: 'slate' as const,
  },
  'costos-estructura': {
    title: 'Costos estructura',
    description: 'Import OpsiaFinance per departament i mes',
    icon: Building2,
    tone: 'violet' as const,
  },
  edicio: {
    title: 'Edició',
    description: 'Fitxa de cost per esdeveniment',
    icon: PencilLine,
    tone: 'cyan' as const,
  },
  resultats: {
    title: 'Resultats',
    description: 'Marges per tipus de servei, ubicació i mes',
    icon: BarChart3,
    tone: 'emerald' as const,
  },
}

export default function CostServeisHubPage() {
  const { data: session } = useSession()
  const user = session?.user
  const { data: uiPermData } = useSWR(user?.id ? '/api/permissions/ui' : null, fetcher)
  const uiMap = (uiPermData?.map || {}) as Record<string, boolean>

  const base = getVisibleModules({
    role: user?.role,
    department: user?.department,
  }).find((m) => m.path === '/menu/cost-serveis')

  const catalog = MODULES.find((m) => m.path === '/menu/cost-serveis')
  const submodules = uiPermData
    ? (catalog?.submodules || []).filter((sub) => uiMap[sub.path] === true)
    : base?.submodules ?? []

  const cards: ModuleHubCard[] = submodules.map((sub) => {
    const key = sub.path.split('/').pop() || sub.path
    const config = CARD_MAP[key as keyof typeof CARD_MAP]
    return {
      href: sub.path,
      title: config?.title ?? sub.label,
      description: config?.description,
      icon: config?.icon ?? Calculator,
      tone: config?.tone ?? 'slate',
    }
  })

  return (
    <ModuleHub
      title="Cost de serveis"
      subtitle="Cost operatiu per esdeveniment (Logística, Serveis i Cuina)."
      cards={cards}
    />
  )
}
