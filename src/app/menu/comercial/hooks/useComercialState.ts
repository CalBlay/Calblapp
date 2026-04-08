import { useEffect, useMemo, useRef, useState } from 'react'
import { loadXlsx } from '@/lib/loadXlsx'
import type { ConceptNode, EventItem, OrderLine, OrderState, ServiceNode } from '../types'

const normalize = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const todayIso = () => new Date().toISOString().slice(0, 10)
const addDaysIso = (base: string, days: number) => {
  const d = new Date(`${base}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function useComercialState() {
  const [services, setServices] = useState<ServiceNode[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [servicesError, setServicesError] = useState<string | null>(null)

  const [events, setEvents] = useState<EventItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState<string>(() => todayIso())
  const [endDate, setEndDate] = useState<string>(() => addDaysIso(todayIso(), 30))
  const [commercialFilter, setCommercialFilter] = useState<string>('__all__')
  const [query, setQuery] = useState<string>('')

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedService, setSelectedService] = useState<string>('')
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [serviceSearch, setServiceSearch] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [selectedConcept, setSelectedConcept] = useState<ConceptNode | null>(null)
  const [addMode, setAddMode] = useState<'concept' | 'article'>('article')
  const [serviceMetaByEvent, setServiceMetaByEvent] = useState<
    Record<string, Record<string, { time?: string; location?: string }>>
  >({})

  const [mobileTab, setMobileTab] = useState<'plats' | 'comanda'>('plats')
  const [activeGroupKey, setActiveGroupKey] = useState<string>('')
  const [orderSearch, setOrderSearch] = useState<string>('')

  const [articlesPage, setArticlesPage] = useState<number>(0)
  const articlesPerPage = 10
  const [conceptsPage, setConceptsPage] = useState<number>(0)
  const conceptsPerPage = 10
  const [eventsPage, setEventsPage] = useState<number>(0)
  const eventsPerPage = 12

  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingQty, setEditingQty] = useState<number>(0)
  const [showAllGroups, setShowAllGroups] = useState<boolean>(false)
  const [actionLog, setActionLog] = useState<string[]>([])

  const [ordersByEvent, setOrdersByEvent] = useState<Record<string, OrderState>>({})
  const groupRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    let active = true
    setServicesLoading(true)
    setServicesError(null)

    fetch('/api/comercial/serveis')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        if (data?.error) {
          setServicesError(data.error)
          setServices([])
        } else {
          setServices(Array.isArray(data?.services) ? data.services : [])
        }
      })
      .catch(() => {
        if (!active) return
        setServicesError("No s'han pogut carregar els serveis.")
      })
      .finally(() => {
        if (active) setServicesLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setEventsLoading(true)
    setEventsError(null)

    const url = `/api/events?from=${startDate}&to=${endDate}`
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!active) return
        const rows = Array.isArray(data?.events) ? data.events : []
        setEvents(rows)
      })
      .catch(() => {
        if (!active) return
        setEventsError("No s'han pogut carregar els esdeveniments.")
        setEvents([])
      })
      .finally(() => {
        if (active) setEventsLoading(false)
      })

    return () => {
      active = false
    }
  }, [startDate, endDate])

  const commercialOptions = useMemo(() => {
    return Array.from(
      new Set(
        events
          .map((e) => e.commercial)
          .filter((c) => typeof c === 'string' && c.trim())
      )
    ).sort()
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = normalize(query)
    return events
      .filter((ev) => {
        if (commercialFilter !== '__all__') {
          if (normalize(ev.commercial) !== normalize(commercialFilter)) return false
        }
        if (!String(ev.eventCode || '').trim()) return false
        if (q) {
          const target = normalize(
            [ev.name, ev.summary, ev.eventCode].filter(Boolean).join(' ')
          )
          if (!target.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const aKey = String(a.start || '').slice(0, 10)
        const bKey = String(b.start || '').slice(0, 10)
        if (aKey !== bKey) return aKey.localeCompare(bKey)
        const aTime = String(a.horaInici || '')
        const bTime = String(b.horaInici || '')
        return aTime.localeCompare(bTime)
      })
  }, [events, commercialFilter, query])

  const totalEventPages = Math.max(
    1,
    Math.ceil(filteredEvents.length / eventsPerPage)
  )
  const pagedEvents = useMemo(() => {
    const start = eventsPage * eventsPerPage
    return filteredEvents.slice(start, start + eventsPerPage)
  }, [filteredEvents, eventsPage])

  useEffect(() => {
    setEventsPage(0)
  }, [commercialFilter, query, startDate, endDate])

  const selectedEvent = useMemo(
    () => filteredEvents.find((e) => e.id === selectedEventId) || null,
    [filteredEvents, selectedEventId]
  )

  useEffect(() => {
    if (!selectedEvent) {
      setSelectedEventId(null)
      return
    }
    setOrdersByEvent((prev) => {
      if (prev[selectedEvent.id]) return prev
      return {
        ...prev,
        [selectedEvent.id]: { pax: Number(selectedEvent.pax) || 0, lines: [] },
      }
    })
  }, [selectedEvent])

  useEffect(() => {
    setActionLog([])
    setOrderSearch('')
    setActiveGroupKey('')
    setShowAllGroups(false)
    setEditingLineId(null)
    setEditingQty(0)
  }, [selectedEventId])

  const baseServices = useMemo(() => {
    if (!services.length) return []
    const eventServei = normalize(selectedEvent?.servei || '')
    if (!eventServei) return []
    const matches = services.filter((s) => normalize(s.name) === eventServei)
    return matches
  }, [services, selectedEvent?.servei])

  useEffect(() => {
    if (!services.length) return
    const list = baseServices
    const eventServeiRaw = (selectedEvent?.servei || '').trim()
    if (!eventServeiRaw) {
      setSelectedServices([])
      setSelectedService('')
      setServiceSearch('')
      return
    }
    if (!list.length && eventServeiRaw) {
      setSelectedServices([eventServeiRaw])
      setSelectedService(eventServeiRaw)
      setServiceSearch('')
      return
    }
    if (!list.length) return
    setSelectedServices(list.map((s) => s.name))
    setSelectedService(list[0]?.name || '')
    setServiceSearch('')
  }, [services, baseServices, selectedEventId, selectedEvent?.servei])

  const activeService = useMemo(
    () => services.find((s) => s.name === selectedService) || null,
    [services, selectedService]
  )

  const filteredServices = useMemo(() => {
    const q = normalize(serviceSearch)
    if (!q) return []
    return services.filter((s) => normalize(s.name).includes(q))
  }, [services, serviceSearch])

  const visibleServices = useMemo(() => {
    if (selectedServices.length === 0) return []
    const set = new Set(selectedServices)
    const known = services.filter((s) => set.has(s.name))
    const missing = selectedServices
      .filter((name) => !known.some((s) => s.name === name))
      .map((name) => ({ name, templates: [] as any }))
    return [...known, ...missing]
  }, [services, selectedServices])

  const searchResults = useMemo(() => {
    const set = new Set(selectedServices)
    return filteredServices.filter((s) => !set.has(s.name))
  }, [filteredServices, selectedServices])

  const toggleService = (name: string, opts?: { remove?: boolean }) => {
    setSelectedServices((prev) => {
      const has = prev.includes(name)
      if (has && opts?.remove) {
        const next = prev.filter((n) => n !== name)
        if (selectedService === name) {
          setSelectedService(next[0] || '')
        }
        if (selectedEventId) {
          setServiceMetaByEvent((prevMeta) => {
            const current = prevMeta[selectedEventId] || {}
            if (!current[name]) return prevMeta
            const { [name]: _removed, ...rest } = current
            return { ...prevMeta, [selectedEventId]: rest }
          })
          setOrdersByEvent((prevOrders) => {
            const current = prevOrders[selectedEventId]
            if (!current) return prevOrders
            const lines = current.lines.filter((l) => l.service !== name)
            return {
              ...prevOrders,
              [selectedEventId]: { ...current, lines },
            }
          })
        }
        return next
      }
      if (has) {
        const next = prev.filter((n) => n !== name)
        if (selectedService === name) {
          setSelectedService(next[0] || '')
        }
        return next
      }
      return [...prev, name]
    })
  }

  const serviceMeta = useMemo(() => {
    if (!selectedEventId) return {}
    return serviceMetaByEvent[selectedEventId] || {}
  }, [serviceMetaByEvent, selectedEventId])

  const updateServiceMeta = (name: string, data: { time?: string; location?: string }) => {
    if (!selectedEventId) return
    setServiceMetaByEvent((prev) => ({
      ...prev,
      [selectedEventId]: {
        ...(prev[selectedEventId] || {}),
        [name]: {
          ...(prev[selectedEventId]?.[name] || {}),
          ...data,
        },
      },
    }))
  }

  const templates = activeService?.templates || []

  useEffect(() => {
    if (!templates.length) {
      setSelectedTemplate('')
      return
    }
    if (!selectedTemplate || !templates.some((t) => t.name === selectedTemplate)) {
      setSelectedTemplate(templates[0]?.name || '')
    }
  }, [templates, selectedTemplate])

  const concepts = useMemo(() => {
    const tpl = templates.find((t) => t.name === selectedTemplate)
    return tpl?.concepts || []
  }, [templates, selectedTemplate])

  useEffect(() => {
    setArticlesPage(0)
    setConceptsPage(0)
    if (concepts.length === 1 && concepts[0]?.articles?.length) {
      setSelectedConcept((prev) =>
        prev?.name === concepts[0]?.name ? prev : concepts[0]
      )
    } else {
      setSelectedConcept(null)
    }
  }, [selectedService, selectedTemplate, concepts])

  const hasDirectArticles = useMemo(() => {
    return Boolean(selectedConcept?.articles?.length)
  }, [selectedConcept])

  const directArticlesLabel = useMemo(() => {
    return selectedConcept?.name || ''
  }, [selectedConcept])

  const activeArticles = useMemo(() => {
    return selectedConcept?.articles || []
  }, [selectedConcept])

  const totalConceptsPages = Math.max(
    1,
    Math.ceil(concepts.length / conceptsPerPage)
  )

  const pagedConcepts = useMemo(() => {
    const start = conceptsPage * conceptsPerPage
    return concepts.slice(start, start + conceptsPerPage)
  }, [concepts, conceptsPage])

  const totalArticlesPages = Math.max(
    1,
    Math.ceil(activeArticles.length / articlesPerPage)
  )

  const pagedArticles = useMemo(() => {
    const start = articlesPage * articlesPerPage
    return activeArticles.slice(start, start + articlesPerPage)
  }, [activeArticles, articlesPage])

  useEffect(() => {
    setArticlesPage(0)
  }, [selectedConcept])

  useEffect(() => {
    setConceptsPage(0)
  }, [concepts.length, selectedTemplate])

  const currentOrder = selectedEventId ? ordersByEvent[selectedEventId] : undefined
  const selectedLineSet = useMemo(() => {
    const lines = currentOrder?.lines || []
    const scoped = lines.filter(
      (l) => l.service === selectedService && l.template === selectedTemplate
    )
    return new Set(scoped.map((l) => l.concept))
  }, [currentOrder?.lines, selectedService, selectedTemplate])

  const selectedTemplateSet = useMemo(() => {
    const lines = currentOrder?.lines || []
    const scoped = lines.filter((l) => l.service === selectedService)
    return new Set(scoped.map((l) => l.template))
  }, [currentOrder?.lines, selectedService])

  const selectedConceptSet = useMemo(() => {
    const lines = currentOrder?.lines || []
    const scoped = lines.filter(
      (l) => l.service === selectedService && l.template === selectedTemplate
    )
    const lineConcepts = new Set(scoped.map((l) => l.concept))
    const set = new Set<string>()
    concepts.forEach((concept) => {
      if (lineConcepts.has(concept.name)) {
        set.add(concept.name)
        return
      }
      const articles = concept.articles || []
      if (articles.some((article) => lineConcepts.has(article))) {
        set.add(concept.name)
      }
    })
    return set
  }, [currentOrder?.lines, selectedService, selectedTemplate, concepts])
  const groupedLines = useMemo(() => {
    const lines = currentOrder?.lines || []
    const groups: Array<{
      key: string
      service: string
      template: string
      items: OrderLine[]
    }> = []
    const map = new Map<string, number>()
    lines.forEach((line) => {
      const key = `${line.service}__${line.template}`
      const idx = map.get(key)
      if (idx === undefined) {
        map.set(key, groups.length)
        groups.push({
          key,
          service: line.service,
          template: line.template,
          items: [line],
        })
      } else {
        groups[idx].items.push(line)
      }
    })
    return groups
  }, [currentOrder?.lines])

  const filteredGroupedLines = useMemo(() => {
    const q = normalize(orderSearch)
    if (!q) return groupedLines
    return groupedLines
      .map((group) => ({
        ...group,
        items: group.items.filter((line) => normalize(line.concept).includes(q)),
      }))
      .filter((group) => group.items.length > 0)
  }, [groupedLines, orderSearch])

  const activeGroup = useMemo(() => {
    if (!filteredGroupedLines.length) return null
    return (
      filteredGroupedLines.find((g) => g.key === activeGroupKey) ||
      filteredGroupedLines[0]
    )
  }, [filteredGroupedLines, activeGroupKey])

  useEffect(() => {
    if (!filteredGroupedLines.length) {
      setActiveGroupKey('')
      return
    }
    const exists = filteredGroupedLines.some((g) => g.key === activeGroupKey)
    if (!exists) {
      const next = filteredGroupedLines[0].key
      setActiveGroupKey(next)
    }
  }, [filteredGroupedLines, activeGroupKey])

  const updatePax = (value: number) => {
    if (!selectedEventId) return
    setOrdersByEvent((prev) => ({
      ...prev,
      [selectedEventId]: {
        pax: value,
        lines: prev[selectedEventId]?.lines || [],
      },
    }))
  }

  const logAction = (text: string) => {
    setActionLog((prev) => [text, ...prev].slice(0, 3))
  }

  const addConcept = (concept: string) => {
    if (!selectedEventId || !selectedService || !selectedTemplate) return
    const key = `${selectedService}__${selectedTemplate}`
    setOrdersByEvent((prev) => {
      const current = prev[selectedEventId] || { pax: 0, lines: [] }
      const qty = Math.max(Number(current.pax) || 0, 1)
      const lineKey = `${selectedService}__${selectedTemplate}__${concept}`
      const existingIndex = current.lines.findIndex((l) => l.id === lineKey)
      const lines = [...current.lines]
      if (existingIndex >= 0) {
        return { ...prev, [selectedEventId]: { ...current, lines } }
      } else {
        lines.push({
          id: lineKey,
          service: selectedService,
          template: selectedTemplate,
          concept,
          qty,
        })
      }
      return { ...prev, [selectedEventId]: { ...current, lines } }
    })
    setActiveGroupKey(key)
    logAction(`+ ${concept}`)
  }

  const handleConceptClick = (concept: ConceptNode) => {
    const hasArticles = Boolean(concept.articles && concept.articles.length > 0)
    if (hasArticles) {
      setSelectedConcept(concept)
      if (addMode === 'concept') {
        addConcept(concept.name)
      }
      return
    }
    setSelectedConcept(null)
    addConcept(concept.name)
  }

  const handleArticleClick = (article: string) => {
    if (!selectedConcept || addMode !== 'article') return
    addConcept(article)
  }

  const updateLineQty = (lineId: string, qty: number) => {
    if (!selectedEventId) return
    setOrdersByEvent((prev) => {
      const current = prev[selectedEventId]
      if (!current) return prev
      const lines = current.lines.map((l) =>
        l.id === lineId ? { ...l, qty } : l
      )
      const line = current.lines.find((l) => l.id === lineId)
      if (line) logAction(`~ ${line.concept} (${qty})`)
      return { ...prev, [selectedEventId]: { ...current, lines } }
    })
  }

  const removeLine = (lineId: string) => {
    if (!selectedEventId) return
    setOrdersByEvent((prev) => {
      const current = prev[selectedEventId]
      if (!current) return prev
      const line = current.lines.find((l) => l.id === lineId)
      const lines = current.lines.filter((l) => l.id !== lineId)
      if (line) logAction(`- ${line.concept}`)
      return { ...prev, [selectedEventId]: { ...current, lines } }
    })
  }

  const clearOrder = () => {
    if (!selectedEventId) return
    setOrdersByEvent((prev) => ({
      ...prev,
      [selectedEventId]: {
        pax: prev[selectedEventId]?.pax || 0,
        lines: [],
      },
    }))
  }

  const orderSummary = useMemo(() => {
    const lines = currentOrder?.lines || []
    const servicesSet = new Set(lines.map((l) => l.service))
    const templatesSet = new Set(lines.map((l) => `${l.service}__${l.template}`))
    return {
      items: lines.length,
      services: servicesSet.size,
      templates: templatesSet.size,
    }
  }, [currentOrder?.lines])

  const exportRows = useMemo(() => {
    if (!selectedEvent || !currentOrder) return []
    const qty = currentOrder.pax ?? 0
    const rows: Array<Record<string, string | number>> = []
    groupedLines.forEach((group) => {
      group.items.forEach((line) => {
        rows.push({
          Esdeveniment: selectedEvent.name || selectedEvent.summary || '',
          Data: selectedEvent.start || '',
          Hora: selectedEvent.horaInici || '',
          Ubicacio: selectedEvent.location || '',
          Comercial: selectedEvent.commercial || '',
          Servei: group.service,
          Plantilla: group.template,
          Concepte: line.concept,
          Comensals: qty,
        })
      })
    })
    return rows
  }, [selectedEvent, currentOrder, groupedLines])

  const handleExportExcel = async () => {
    if (!exportRows.length || !selectedEvent) return
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Comanda')
    const safeName = (selectedEvent.name || 'comanda').replace(/[\\/:*?"<>|]/g, '')
    XLSX.writeFile(wb, `${safeName}.xlsx`)
  }

  const handleExportPdfTable = () => {
    if (!exportRows.length || !selectedEvent) return
    const cols = [
      'Esdeveniment',
      'Data',
      'Hora',
      'Ubicacio',
      'Comercial',
      'Servei',
      'Plantilla',
      'Concepte',
      'Comensals',
    ]
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String((row as any)[key] ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Comanda</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Comanda</h1>
    <div class="meta">${escapeHtml(selectedEvent.name || '')}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const handleExportPdfView = () => {
    if (!exportRows.length) return
    window.print()
  }

  const exportItems = useMemo(
    () => [
      { label: 'Excel (.xlsx)', onClick: handleExportExcel, disabled: !exportRows.length },
      { label: 'PDF (vista)', onClick: handleExportPdfView, disabled: !exportRows.length },
      { label: 'PDF (taula)', onClick: handleExportPdfTable, disabled: !exportRows.length },
    ],
    [exportRows.length, handleExportExcel, handleExportPdfView, handleExportPdfTable]
  )

  const duplicateSources = useMemo(() => {
    if (!selectedEventId) return []
    return Object.keys(ordersByEvent)
      .filter((id) => id !== selectedEventId)
      .map((id) => ({
        id,
        label:
          events.find((e) => e.id === id)?.name ||
          events.find((e) => e.id === id)?.summary ||
          id,
      }))
  }, [ordersByEvent, selectedEventId, events])

  const handleDuplicateFrom = (sourceId: string) => {
    if (!selectedEventId) return
    const source = ordersByEvent[sourceId]
    if (!source) return
    setOrdersByEvent((prev) => ({
      ...prev,
      [selectedEventId]: {
        pax: source.pax,
        lines: source.lines.map((l) => ({ ...l })),
      },
    }))
    logAction('⟳ Comanda duplicada')
  }

  return {
    services,
    servicesLoading,
    servicesError,
    eventsLoading,
    eventsError,
    commercialOptions,
    filteredEvents,
    pagedEvents,
    totalEventPages,
    eventsPage,
    setEventsPage,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    commercialFilter,
    setCommercialFilter,
    query,
    setQuery,
    selectedEventId,
    setSelectedEventId,
    selectedEvent,
    serviceSearch,
    setServiceSearch,
    searchResults,
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
    handleConceptClick,
    handleArticleClick,
    currentOrder,
    filteredGroupedLines,
    activeGroupKey,
    setActiveGroupKey,
    activeGroup,
    groupRefs,
    orderSearch,
    setOrderSearch,
    updatePax,
    addConcept,
    updateLineQty,
    removeLine,
    clearOrder,
    orderSummary,
    showAllGroups,
    setShowAllGroups,
    actionLog,
    editingLineId,
    setEditingLineId,
    editingQty,
    setEditingQty,
    selectedLineSet,
    selectedTemplateSet,
    selectedConceptSet,
    serviceMeta,
    updateServiceMeta,
    exportItems,
    duplicateSources,
    handleDuplicateFrom,
    mobileTab,
    setMobileTab,
  }
}
