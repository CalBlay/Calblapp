import React, { useState } from 'react'
import { Clock } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ConceptNode } from '../types'

interface Props {
  serviceSearch: string
  setServiceSearch: (value: string) => void
  searchResults: { name: string }[]
  selectedServices: string[]
  visibleServices: { name: string }[]
  selectedService: string
  setSelectedService: (name: string) => void
  toggleService: (name: string, opts?: { remove?: boolean }) => void
  templates: { name: string }[]
  selectedTemplate: string
  setSelectedTemplate: (name: string) => void
  hasDirectArticles: boolean
  directArticlesLabel: string
  pagedArticles: string[]
  activeArticles: string[]
  totalArticlesPages: number
  articlesPage: number
  setArticlesPage: React.Dispatch<React.SetStateAction<number>>
  pagedConcepts: ConceptNode[]
  concepts: ConceptNode[]
  conceptsPage: number
  totalConceptsPages: number
  setConceptsPage: React.Dispatch<React.SetStateAction<number>>
  conceptsPerPage: number
  selectedConcept: ConceptNode | null
  articlesPerPage: number
  addMode: 'concept' | 'article'
  setAddMode: (mode: 'concept' | 'article') => void
  selectedLineSet: Set<string>
  selectedTemplateSet: Set<string>
  selectedConceptSet: Set<string>
  serviceMeta: Record<string, { time?: string; location?: string }>
  updateServiceMeta: (name: string, data: { time?: string; location?: string }) => void
  handleConceptClick: (concept: ConceptNode) => void
  handleArticleClick: (article: string) => void
}

export default function ServicePanel({
  serviceSearch,
  setServiceSearch,
  searchResults,
  selectedServices,
  visibleServices,
  selectedService,
  setSelectedService,
  toggleService,
  templates,
  selectedTemplate,
  setSelectedTemplate,
  hasDirectArticles,
  directArticlesLabel,
  pagedArticles,
  activeArticles,
  totalArticlesPages,
  articlesPage,
  setArticlesPage,
  pagedConcepts,
  concepts,
  conceptsPage,
  totalConceptsPages,
  setConceptsPage,
  conceptsPerPage,
  selectedConcept,
  articlesPerPage,
  addMode,
  setAddMode,
  selectedLineSet,
  selectedTemplateSet,
  selectedConceptSet,
  serviceMeta,
  updateServiceMeta,
  handleConceptClick,
  handleArticleClick,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingService, setEditingService] = useState('')
  const [editingTime, setEditingTime] = useState('')
  const [editingLocation, setEditingLocation] = useState('')

  const openServiceMeta = (name: string) => {
    const meta = serviceMeta[name] || {}
    setEditingService(name)
    setEditingTime(meta.time || '')
    setEditingLocation(meta.location || '')
    setSheetOpen(true)
  }
  return (
    <section className="cmd-panel rounded-2xl border p-3 md:p-4 flex flex-col min-h-[360px] sm:min-h-[420px]">
      <div className="mb-3 space-y-2">
        <input
          type="text"
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm md:text-xs"
          placeholder="Afegeix servei (cerca)"
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
        />
        {serviceSearch && searchResults.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {searchResults.map((service) => (
              <button
                key={service.name}
                onClick={() => {
                  toggleService(service.name)
                  setServiceSearch('')
                }}
                className="rounded-full px-3 py-1 text-xs border bg-white border-slate-200 text-slate-500"
              >
                {service.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {visibleServices.map((service) => {
          const active = service.name === selectedService
          return (
            <div key={service.name} className="relative">
              <button
                onClick={() => setSelectedService(service.name)}
                className={`cmd-tile w-full sm:w-auto rounded-xl px-4 py-3 md:py-2.5 text-sm md:text-[13px] font-semibold shadow-sm pr-8 ${
                  active ? 'cmd-service-active' : ''
                }`}
              >
                <div>{service.name}</div>
                {(serviceMeta[service.name]?.time || serviceMeta[service.name]?.location) && (
                  <div className="mt-1 text-[11px] text-slate-500 font-normal">
                    {serviceMeta[service.name]?.time || '--:--'}
                    {serviceMeta[service.name]?.location
                      ? ` · ${serviceMeta[service.name]?.location}`
                      : ''}
                  </div>
                )}
              </button>
              <button
                type="button"
                aria-label="Editar dades del servei"
                onClick={(e) => {
                  e.stopPropagation()
                  openServiceMeta(service.name)
                }}
                className="absolute left-2 top-2 h-6 w-6 rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600 hover:border-slate-300"
              >
                <Clock className="mx-auto h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Eliminar servei"
                onClick={(e) => {
                  e.stopPropagation()
                  const ok = window.confirm(
                    "Estàs segur que vols eliminar aquest servei i totes les línies associades?"
                  )
                  if (!ok) return
                  toggleService(service.name, { remove: true })
                }}
                className="absolute right-2 top-2 h-5 w-5 rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 bg-white"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 flex flex-col">
          <div className="text-[11px] md:text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
            Plantilles
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((tpl) => {
              const active = tpl.name === selectedTemplate
              return (
                <button
                  key={tpl.name}
                  onClick={() => setSelectedTemplate(tpl.name)}
                  className={`cmd-tile rounded-lg px-3 py-3 md:py-2.5 text-sm md:text-[13px] font-semibold ${
                    active ? 'cmd-template-active' : ''
                  } ${selectedTemplateSet.has(tpl.name) ? 'cmd-picked' : ''}`}
                >
                  {tpl.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 flex flex-col">
          <div className="text-[11px] md:text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
            Conceptes
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto">
            {pagedConcepts.map((concept) => {
              const active = selectedConcept?.name === concept.name
              return (
                <button
                  key={concept.name}
                  onClick={() => handleConceptClick(concept)}
                  className={`cmd-tile rounded-lg px-3 py-3 md:py-2.5 text-sm md:text-[13px] font-medium ${
                    active ? 'cmd-concept-active' : ''
                  } ${selectedConceptSet.has(concept.name) ? 'cmd-picked' : ''}`}
                >
                  {concept.name}
                </button>
              )
            })}
          </div>
          {concepts.length > conceptsPerPage && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <button
                className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
                onClick={() => setConceptsPage((p) => Math.max(0, p - 1))}
                disabled={conceptsPage === 0}
                aria-label="Anterior"
              >
                ‹
              </button>
              <span className="text-[11px] text-slate-500">
                {conceptsPage + 1} / {totalConceptsPages}
              </span>
              <button
                className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
                onClick={() =>
                  setConceptsPage((p) =>
                    Math.min(totalConceptsPages - 1, p + 1)
                  )
                }
                disabled={conceptsPage >= totalConceptsPages - 1}
                aria-label="Següent"
              >
                ›
              </button>
            </div>
          )}
        </div>
      </div>

      {hasDirectArticles && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:p-4 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[11px] md:text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              Articles · {directArticlesLabel || 'Sense nom'}
            </div>
            <div className="flex rounded-full border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setAddMode('concept')}
                className={`px-2.5 py-1 text-[11px] md:text-[10px] rounded-full transition ${
                  addMode === 'concept'
                    ? 'bg-slate-100 text-slate-700'
                    : 'text-slate-500'
                }`}
              >
                Afegir concepte
              </button>
              <button
                type="button"
                onClick={() => setAddMode('article')}
                className={`px-2.5 py-1 text-[11px] md:text-[10px] rounded-full transition ${
                  addMode === 'article'
                    ? 'bg-slate-100 text-slate-700'
                    : 'text-slate-500'
                }`}
              >
                Afegir article
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {pagedArticles.map((article) => (
              <button
                key={article}
                onClick={() => handleArticleClick(article)}
                disabled={addMode !== 'article'}
                className={`cmd-tile rounded-lg px-3 py-3 md:py-2.5 text-sm md:text-[13px] font-medium ${
                  addMode !== 'article' ? 'cmd-article-disabled' : ''
                } ${selectedLineSet.has(article) ? 'cmd-picked' : ''}`}
              >
                {article}
              </button>
            ))}
          </div>
          {activeArticles.length > articlesPerPage && (
            <div className="mt-2 flex items-center justify-center gap-2">
              <button
                className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
                onClick={() => setArticlesPage((p) => Math.max(0, p - 1))}
                disabled={articlesPage === 0}
                aria-label="Anterior"
              >
                ‹
              </button>
              <span className="text-[11px] text-slate-500">
                {articlesPage + 1} / {totalArticlesPages}
              </span>
              <button
                className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-500 disabled:opacity-40"
                onClick={() =>
                  setArticlesPage((p) =>
                    Math.min(totalArticlesPages - 1, p + 1)
                  )
                }
                disabled={articlesPage >= totalArticlesPages - 1}
                aria-label="Següent"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-5 sm:p-6 h-[60vh] sm:h-[50vh]"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Dades del servei</SheetTitle>
            <p className="text-xs text-slate-500">{editingService}</p>
          </SheetHeader>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Hora
              <input
                type="time"
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={editingTime}
                onChange={(e) => setEditingTime(e.target.value)}
              />
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Ubicació
              <input
                type="text"
                className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                placeholder="Ex: Palau de Congressos"
                value={editingLocation}
                onChange={(e) => setEditingLocation(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className="flex-1 h-11 rounded-md border border-slate-200 bg-white text-slate-600 text-sm font-semibold"
              onClick={() => setSheetOpen(false)}
            >
              Cancel·la
            </button>
            <button
              type="button"
              className="flex-1 h-11 rounded-md bg-slate-900 text-white text-sm font-semibold"
              onClick={() => {
                updateServiceMeta(editingService, {
                  time: editingTime,
                  location: editingLocation,
                })
                setSheetOpen(false)
              }}
            >
              Desa
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
