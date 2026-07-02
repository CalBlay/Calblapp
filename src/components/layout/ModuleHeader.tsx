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

export default function ModuleHeader({
  title,
  subtitle,
  breadcrumbSubtitle,
  icon,
  actions,
  mainHref,
}: Props) {
  const pathname = usePathname() ?? ''

  // Exemple: /menu/spaces/reserves Ã¢â€ â€™ ['','menu','spaces','reserves']
  const segments = pathname.split('/').filter(Boolean)

  // Identifiquem el mòdul (spaces, torns, quadrants, etc.)
  const moduleKey = segments[1] || ''
  const submodule = segments[2] || ''
  const subsubmodule = segments[3] || ''

  // Map colors automàtics
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

  const color = colorMap[moduleKey] ?? 'from-gray-50 to-gray-100'

  // Traducció Ã¢â‚¬Å“mòdul Ã¢â€ â€™ nom visibleÃ¢â‚¬Â
  const moduleLabels: Record<string, string> = {
    projects: 'OpsiaProjects',
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

  const mainLabel = title || moduleLabels[moduleKey] || moduleKey
  const resolvedMainHref = mainHref || (moduleKey ? `/menu/${moduleKey}` : '')

  // Traducció Ã¢â‚¬Å“submòdul Ã¢â€ â€™ nom visibleÃ¢â‚¬Â
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
    fulls: 'Full de Treball',
    seguiment: 'Seguiment',
    historial: 'Historial',
    quadre: 'Quadre de comandament',
    tipologies: 'Tipologies',
    permisos: 'Permisos',
    magatzems: 'Magatzems',
    articles: 'Articles comanda',
    serveis: 'Serveis',
  }

  const subKey = subLabels[subsubmodule] ? subsubmodule : submodule
  const subLabel = breadcrumbSubtitle || subtitle || subLabels[subKey] || ''
  const subHref =
    subLabel && subKey === subsubmodule && submodule && subsubmodule
      ? `/menu/${moduleKey}/${submodule}/${subsubmodule}`
      : subLabel
        ? `/menu/${moduleKey}/${submodule}`
        : ''

  return (
    <div className={`w-full bg-gradient-to-r ${color} border-b border-gray-200 px-4 py-3`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        {/* LEFT SIDE */}
        <div className="flex items-center gap-2">
          {icon && <div>{icon}</div>}

          <div className="flex flex-col">

            {/* BREADCRUMB AUTOMÃƒâ‚¬TIC */}
            <div className="flex items-center gap-1 text-sm font-semibold">
              
              {/* MÃƒâ€™DUL PRINCIPAL (clicable) */}
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

              {/* SEPARADOR */}
              {subLabel && <span className="text-gray-500">/</span>}

              {/* SUBMÃƒâ€™DUL (clicable) */}
              {subLabel && (
                <a
                  href={subHref}
                  className="text-gray-700 hover:underline"
                >
                  {subLabel}
                </a>
              )}
            </div>

            {/* SUBTÃƒÂTOL OPCIONAL */}
            {subtitle && (
              <div className="text-xs italic text-gray-600">{subtitle}</div>
            )}

          </div>
        </div>

        {/* RIGHT SIDE */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{actions}</div>
        )}
      </div>
    </div>
  )
}
