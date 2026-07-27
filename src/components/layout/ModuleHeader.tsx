'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

interface Props {
  title?: string | React.ReactNode
  subtitle?: string
  breadcrumbSubtitle?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  mainHref?: string
}

const normalizeLabel = (value?: string) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export default function ModuleHeader({
  title,
  subtitle,
  breadcrumbSubtitle,
  icon,
  actions,
  mainHref,
}: Props) {
  const pathname = usePathname() ?? ''
  const segments = pathname.split('/').filter(Boolean)

  const moduleKey = segments[1] || ''
  const submodule = segments[2] || ''
  const subsubmodule = segments[3] || ''

  const colorMap: Record<string, string> = {
    personnel: 'from-green-100 to-lime-100',
    events: 'from-yellow-100 to-orange-100',
    auditoria: 'from-cyan-100 to-teal-100',
    spaces: 'from-emerald-100 to-green-50',
    torns: 'from-blue-100 to-blue-50',
    quadrants: 'from-indigo-100 to-indigo-50',
    allergens: 'from-amber-100 to-yellow-50',
    manteniment: 'from-emerald-50 to-green-100',
    deco: 'from-rose-50 to-pink-100',
    incidents: 'from-red-100 to-pink-100',
    documentacio: 'from-teal-100 to-cyan-50',
    'roba-personal': 'from-sky-100 to-indigo-50',
    reports: 'from-cyan-100 to-indigo-50',
    projects: 'from-violet-100 to-fuchsia-50',
    settings: 'from-slate-100 to-gray-50',
  }

  const moduleLabels: Record<string, string> = {
    projects: 'Projectes',
    spaces: 'Espais',
    torns: 'Torns',
    quadrants: 'Quadrants',
    personnel: 'Personal',
    events: 'Esdeveniments',
    auditoria: 'Auditoria',
    allergens: 'Al·lèrgens',
    manteniment: 'Manteniment',
    deco: 'Deco',
    incidents: 'Incidències',
    documentacio: 'Documentació',
    'roba-personal': 'Roba personal',
    reports: 'Informes',
    settings: 'Settings',
  }

  const subLabels: Record<string, string> = {
    reserves: 'Reserves',
    operativa: 'Operativa',
    drafts: 'Esborranys',
    premisses: 'Premisses',
    info: 'Informació',
    assigned: 'Assignats',
    bbdd: 'BBDD plats',
    buscador: 'Buscador',
    treball: 'Fulls de treball',
    tickets: 'Tickets',
    'tickets-deco': 'Tickets',
    preventius: 'Preventius',
    planificador: 'Planificador',
    plantilles: 'Plantilles',
    valoracio: 'Avaluacio',
    consulta: 'Consulta',
    fulls: 'Full de treball',
    seguiment: 'Seguiment',
    historial: 'Historial',
    quadre: 'Quadre de comandament',
    tipologies: 'Tipologies',
    permisos: 'Permisos',
    magatzems: 'Magatzems',
    articles: 'Articles comanda',
    serveis: 'Serveis',
  }

  const color = colorMap[moduleKey] ?? 'from-gray-50 to-gray-100'
  const mainLabel = title || moduleLabels[moduleKey] || moduleKey
  const resolvedMainHref = mainHref || (moduleKey ? `/menu/${moduleKey}` : '')
  const subKey = subLabels[subsubmodule] ? subsubmodule : submodule
  const subLabel = breadcrumbSubtitle || subtitle || subLabels[subKey] || ''
  const subHref =
    subLabel && subKey === subsubmodule && submodule && subsubmodule
      ? `/menu/${moduleKey}/${submodule}/${subsubmodule}`
      : subLabel
        ? `/menu/${moduleKey}/${submodule}`
        : ''

  const repeatedSubtitle =
    Boolean(subtitle) && normalizeLabel(subtitle) === normalizeLabel(subLabel)
  const mobileSubtitle = repeatedSubtitle ? '' : subtitle || subLabel

  return (
    <div
      className={`w-full rounded-[28px] border border-white/70 bg-gradient-to-r ${color} px-4 py-4 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] sm:rounded-[32px] sm:px-5`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm backdrop-blur-sm">
              {icon}
            </div>
          ) : null}

          <div className="min-w-0">
            <div className="sm:hidden">
              <div className="truncate text-[1.1rem] font-semibold text-slate-900">
                {mainLabel}
              </div>
              {mobileSubtitle ? (
                <div className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {mobileSubtitle}
                </div>
              ) : null}
            </div>

            <div className="hidden sm:flex sm:flex-col">
              <div className="flex items-center gap-1 text-sm font-semibold">
                {title ? (
                  resolvedMainHref ? (
                    <a href={resolvedMainHref} className="text-gray-800 hover:underline">
                      {mainLabel}
                    </a>
                  ) : (
                    <span className="text-gray-800">{mainLabel}</span>
                  )
                ) : (
                  <a href={`/menu/${moduleKey}`} className="text-gray-800 hover:underline">
                    {mainLabel}
                  </a>
                )}
                {subLabel ? <span className="text-gray-500">/</span> : null}
                {subLabel ? (
                  <a href={subHref} className="text-gray-700 hover:underline">
                    {subLabel}
                  </a>
                ) : null}
              </div>

              {subtitle && !repeatedSubtitle ? (
                <div className="text-xs italic text-gray-600">{subtitle}</div>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/70 p-1.5 shadow-sm backdrop-blur-sm sm:bg-transparent sm:p-0 sm:shadow-none">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}
