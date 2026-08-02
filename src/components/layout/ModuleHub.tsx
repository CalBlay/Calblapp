'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { MotionDiv } from '@/lib/lazyMotion'

export type ModuleHubTone =
  | 'amber'
  | 'teal'
  | 'sky'
  | 'emerald'
  | 'indigo'
  | 'violet'
  | 'cyan'
  | 'slate'
  | 'blue'
  | 'orange'
  | 'green'

type ModuleHubCardTone = {
  cardClassName: string
  iconClassName: string
}

const HUB_CARD_TONES: Record<ModuleHubTone, ModuleHubCardTone> = {
  amber: {
    cardClassName: 'bg-gradient-to-br from-amber-50 to-yellow-100',
    iconClassName: 'text-amber-700',
  },
  teal: {
    cardClassName: 'bg-gradient-to-br from-teal-50 to-cyan-100',
    iconClassName: 'text-teal-700',
  },
  sky: {
    cardClassName: 'bg-gradient-to-br from-sky-50 to-blue-100',
    iconClassName: 'text-sky-700',
  },
  emerald: {
    cardClassName: 'bg-gradient-to-br from-emerald-50 to-green-100',
    iconClassName: 'text-emerald-600',
  },
  indigo: {
    cardClassName: 'bg-gradient-to-br from-indigo-50 to-purple-100',
    iconClassName: 'text-indigo-600',
  },
  violet: {
    cardClassName: 'bg-gradient-to-br from-violet-50 to-fuchsia-100',
    iconClassName: 'text-violet-600',
  },
  cyan: {
    cardClassName: 'bg-gradient-to-br from-cyan-50 to-teal-100',
    iconClassName: 'text-cyan-700',
  },
  slate: {
    cardClassName: 'bg-gradient-to-br from-slate-50 to-gray-100',
    iconClassName: 'text-slate-700',
  },
  blue: {
    cardClassName: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    iconClassName: 'text-blue-700',
  },
  orange: {
    cardClassName: 'bg-gradient-to-br from-orange-50 to-amber-100',
    iconClassName: 'text-orange-700',
  },
  green: {
    cardClassName: 'bg-gradient-to-br from-green-50 to-emerald-100',
    iconClassName: 'text-green-700',
  },
}

export type ModuleHubCard = {
  href: string
  title: string
  description?: string
  icon: LucideIcon
  tone: ModuleHubTone
  badge?: ReactNode
}

type ModuleHubProps = {
  title?: string | ReactNode
  subtitle?: string
  breadcrumbSubtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  mainHref?: string
  cards: ModuleHubCard[]
  emptyMessage?: string
  beforeGrid?: ReactNode
  afterGrid?: ReactNode
  containerClassName?: string
  gridClassName?: string
}

export default function ModuleHub({
  title,
  subtitle,
  breadcrumbSubtitle,
  icon,
  actions,
  mainHref,
  cards,
  emptyMessage = 'No tens accés a cap secció.',
  beforeGrid,
  afterGrid,
  containerClassName = 'w-full max-w-6xl mx-auto p-4 space-y-5',
  gridClassName = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3',
}: ModuleHubProps) {
  return (
    <div className={containerClassName}>
      <ModuleHeader
        title={title}
        subtitle={subtitle}
        breadcrumbSubtitle={breadcrumbSubtitle}
        icon={icon}
        actions={actions}
        mainHref={mainHref}
      />

      {beforeGrid}

      <div className={gridClassName}>
        {cards.map((card) => {
          const tone = HUB_CARD_TONES[card.tone]
          const Icon = card.icon

          return (
            <Link key={card.href} href={card.href}>
              <MotionDiv
                whileTap={{ scale: 0.985 }}
                className={`border rounded-2xl p-5 hover:shadow-sm transition-shadow ${tone.cardClassName}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`relative w-10 h-10 rounded-full bg-white shadow flex items-center justify-center ${tone.iconClassName}`}
                  >
                    <Icon className="w-5 h-5" />
                    {card.badge}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-gray-900">{card.title}</div>
                    {card.description ? <div className="text-xs text-gray-500">{card.description}</div> : null}
                  </div>
                </div>
              </MotionDiv>
            </Link>
          )
        })}
      </div>

      {!cards.length ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">{emptyMessage}</div>
      ) : null}

      {afterGrid}
    </div>
  )
}
