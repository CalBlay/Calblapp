'use client'

import { useSession } from 'next-auth/react'
import { RoleGuard } from '@/lib/withRoleGuard'
import ComercialHeader from './components/ComercialHeader'
import EventsFilters from './components/EventsFilters'
import EventsGrid from './components/EventsGrid'
import ServicePanel from './components/ServicePanel'
import OrderPanel from './components/OrderPanel'
import { useComercialState } from './hooks/useComercialState'

export default function ComercialPage() {
  const { status } = useSession()

  const {
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
    articlesPerPage,
    pagedConcepts,
    concepts,
    conceptsPage,
    totalConceptsPages,
    setConceptsPage,
    conceptsPerPage,
    selectedConcept,
    addMode,
    setAddMode,
    handleConceptClick,
    handleArticleClick,
    currentOrder,
    filteredGroupedLines,
    setActiveGroupKey,
    activeGroup,
    groupRefs,
    orderSearch,
    setOrderSearch,
    updatePax,
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
  } = useComercialState()

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center h-[80vh] text-sm text-gray-500">
        Carregant…
      </div>
    )
  }

  const formatDate = (value?: string) => {
    if (!value) return '-'
    const raw = value.slice(0, 10)
    const parts = raw.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return value
  }

  const eventDetails =
    selectedEvent
      ? `${formatDate(selectedEvent.start)} · ${selectedEvent.horaInici || '-'} · ${
          selectedEvent.location || '-'
        } · Comercial: ${selectedEvent.commercial || '-'}`
      : ''

  const eventTitle =
    selectedEvent && (selectedEvent.name || selectedEvent.summary)
      ? `${selectedEvent.name || selectedEvent.summary}${
          selectedEvent.eventCode ? ` · ${selectedEvent.eventCode}` : ''
        }`
      : 'Sense nom'

  return (
    <RoleGuard allowedRoles={['admin', 'observer']}>
      <main className="min-h-screen bg-[#f7f8fb] cmd-app">
        {!selectedEvent ? (
          <div className="mx-auto max-w-7xl px-4 py-5 space-y-4">
            <EventsFilters
              commercialOptions={commercialOptions}
              commercialFilter={commercialFilter}
              setCommercialFilter={setCommercialFilter}
              startDate={startDate}
              endDate={endDate}
              setStartDate={setStartDate}
              setEndDate={setEndDate}
              query={query}
              setQuery={setQuery}
            />
            <EventsGrid
              loading={eventsLoading}
              error={eventsError}
              events={filteredEvents}
              pagedEvents={pagedEvents}
              page={eventsPage}
              totalPages={totalEventPages}
              onPageChange={setEventsPage}
              onSelect={(id) => {
                setSelectedEventId(id)
                setMobileTab('plats')
              }}
              commercialFilter={commercialFilter}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-5 space-y-4">
            <ComercialHeader
              selectedEventName={eventTitle}
              selectedEventDetails={eventDetails}
              onBackToEvents={() => {
                setSelectedEventId(null)
                setMobileTab('plats')
              }}
              currentOrder={currentOrder}
              updatePax={updatePax}
              clearOrder={clearOrder}
              exportItems={exportItems}
            />

            <div className="hidden md:grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr] gap-4">
              <ServicePanel
                serviceSearch={serviceSearch}
                setServiceSearch={setServiceSearch}
                searchResults={searchResults}
                selectedServices={visibleServices.map((s) => s.name)}
                visibleServices={visibleServices}
                selectedService={selectedService}
                setSelectedService={setSelectedService}
                toggleService={toggleService}
                templates={templates}
                selectedTemplate={selectedTemplate}
                setSelectedTemplate={setSelectedTemplate}
                hasDirectArticles={hasDirectArticles}
                directArticlesLabel={directArticlesLabel}
                pagedArticles={pagedArticles}
                activeArticles={activeArticles}
                totalArticlesPages={totalArticlesPages}
                articlesPage={articlesPage}
                setArticlesPage={setArticlesPage}
                pagedConcepts={pagedConcepts}
                concepts={concepts}
                conceptsPage={conceptsPage}
                totalConceptsPages={totalConceptsPages}
                setConceptsPage={setConceptsPage}
                conceptsPerPage={conceptsPerPage}
                selectedConcept={selectedConcept}
                articlesPerPage={articlesPerPage}
                addMode={addMode}
                setAddMode={setAddMode}
                selectedLineSet={selectedLineSet}
                selectedTemplateSet={selectedTemplateSet}
                selectedConceptSet={selectedConceptSet}
                serviceMeta={serviceMeta}
                updateServiceMeta={updateServiceMeta}
                handleConceptClick={handleConceptClick}
                handleArticleClick={handleArticleClick}
              />

              <OrderPanel
                orderSummary={orderSummary}
                showAllGroups={showAllGroups}
                setShowAllGroups={setShowAllGroups}
                actionLog={actionLog}
                exportItems={exportItems}
                duplicateSources={duplicateSources}
                handleDuplicateFrom={handleDuplicateFrom}
                orderSearch={orderSearch}
                setOrderSearch={setOrderSearch}
                filteredGroupedLines={filteredGroupedLines}
                activeGroup={activeGroup}
                showActiveOnly={!showAllGroups}
                setActiveGroupKey={setActiveGroupKey}
                groupRefs={groupRefs}
                editingLineId={editingLineId}
                editingQty={editingQty}
                setEditingLineId={setEditingLineId}
                setEditingQty={setEditingQty}
                currentOrder={currentOrder}
                updateLineQty={updateLineQty}
                removeLine={removeLine}
                clearOrder={clearOrder}
                showAllGroupsLabel={showAllGroups ? 'Només actiu' : 'Mostra tot'}
                serviceMeta={serviceMeta}
              />
            </div>

            <div className="md:hidden space-y-3">
              <div className="sticky top-0 z-10 bg-[#f7f8fb] pt-1">
                <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  <button
                    className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                      mobileTab === 'plats'
                        ? 'bg-[#e8f1ff] text-[#1f3a5f]'
                        : 'text-slate-500'
                    }`}
                    onClick={() => setMobileTab('plats')}
                  >
                    Plats
                  </button>
                  <button
                    className={`flex-1 rounded-full py-2 text-sm font-semibold transition ${
                      mobileTab === 'comanda'
                        ? 'bg-[#eaf6ef] text-[#1f5c3a]'
                        : 'text-slate-500'
                    }`}
                    onClick={() => setMobileTab('comanda')}
                  >
                    Comanda
                    {orderSummary.items > 0 && (
                      <span className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 border border-slate-200">
                        {orderSummary.items}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {mobileTab === 'plats' ? (
                <ServicePanel
                  serviceSearch={serviceSearch}
                  setServiceSearch={setServiceSearch}
                  searchResults={searchResults}
                  selectedServices={visibleServices.map((s) => s.name)}
                  visibleServices={visibleServices}
                  selectedService={selectedService}
                  setSelectedService={setSelectedService}
                  toggleService={toggleService}
                  templates={templates}
                  selectedTemplate={selectedTemplate}
                  setSelectedTemplate={setSelectedTemplate}
                  hasDirectArticles={hasDirectArticles}
                  directArticlesLabel={directArticlesLabel}
                  pagedArticles={pagedArticles}
                  activeArticles={activeArticles}
                  totalArticlesPages={totalArticlesPages}
                  articlesPage={articlesPage}
                  setArticlesPage={setArticlesPage}
                  pagedConcepts={pagedConcepts}
                  concepts={concepts}
                  conceptsPage={conceptsPage}
                  totalConceptsPages={totalConceptsPages}
                  setConceptsPage={setConceptsPage}
                  conceptsPerPage={conceptsPerPage}
                  selectedConcept={selectedConcept}
                  articlesPerPage={articlesPerPage}
                addMode={addMode}
                setAddMode={setAddMode}
                selectedLineSet={selectedLineSet}
                selectedTemplateSet={selectedTemplateSet}
                selectedConceptSet={selectedConceptSet}
                serviceMeta={serviceMeta}
                updateServiceMeta={updateServiceMeta}
                handleConceptClick={handleConceptClick}
                handleArticleClick={handleArticleClick}
              />
              ) : (
                <OrderPanel
                  orderSummary={orderSummary}
                  showAllGroups={showAllGroups}
                  setShowAllGroups={setShowAllGroups}
                  actionLog={actionLog}
                  exportItems={exportItems}
                  duplicateSources={duplicateSources}
                  handleDuplicateFrom={handleDuplicateFrom}
                  orderSearch={orderSearch}
                  setOrderSearch={setOrderSearch}
                  filteredGroupedLines={filteredGroupedLines}
                  activeGroup={activeGroup}
                  showActiveOnly={!showAllGroups}
                  setActiveGroupKey={setActiveGroupKey}
                groupRefs={groupRefs}
                editingLineId={editingLineId}
                editingQty={editingQty}
                setEditingLineId={setEditingLineId}
                setEditingQty={setEditingQty}
                currentOrder={currentOrder}
                updateLineQty={updateLineQty}
                removeLine={removeLine}
                clearOrder={clearOrder}
                showAllGroupsLabel={showAllGroups ? 'Només actiu' : 'Mostra tot'}
                serviceMeta={serviceMeta}
              />
              )}
            </div>
          </div>
        )}
      </main>
    </RoleGuard>
  )
}
