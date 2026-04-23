'use client'

import { withAdmin } from '@/hooks/withAdmin'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Sparkles } from 'lucide-react'
import { EventByCodeSection } from './EventByCodeSection'
import { EventsListSection } from './EventsListSection'
import { FincaRankingSection } from './FincaRankingSection'
import { OpenConsultSection } from './OpenConsultSection'
import { useConsultesMcpPage } from './useConsultesMcpPage'

function ConsultesMcpPage() {
  const p = useConsultesMcpPage()

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-8 max-w-6xl mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #consultes-mcp-open-print-root, #consultes-mcp-open-print-root * { visibility: visible; }
          #consultes-mcp-open-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <ModuleHeader
        icon={<Sparkles className="w-7 h-7 text-violet-600" />}
        title="Consultes MCP"
        subtitle="Dades reals Firestore via MCP (admin). Vista per llista i detall per code."
      />

      <p className="text-sm text-muted-foreground">
        Les crides passen per <code className="text-xs bg-muted px-1 rounded">/api/mcp/*</code> amb
        clau MCP només al servidor.
      </p>

      <OpenConsultSection
        openQuestion={p.openQuestion}
        setOpenQuestion={p.setOpenQuestion}
        openRich={p.openRich}
        setOpenRich={p.setOpenRich}
        openLoading={p.openLoading}
        openError={p.openError}
        openAnswer={p.openAnswer}
        submitOpenQuestion={p.submitOpenQuestion}
        openChatExportItems={p.openChatExportItems}
      />

      <FincaRankingSection
        fincaStart={p.fincaStart}
        fincaEnd={p.fincaEnd}
        setFincaRange={p.setFincaRange}
        fincaLn={p.fincaLn}
        setFincaLn={p.setFincaLn}
        fincaLines={p.fincaLines}
        fincaLoading={p.fincaLoading}
        fincaError={p.fincaError}
        fincaMeta={p.fincaMeta}
        fincaChartData={p.fincaChartData}
        loadFincaRanking={p.loadFincaRanking}
      />

      <EventByCodeSection
        eventCode={p.eventCode}
        setEventCode={p.setEventCode}
        loadingCode={p.loadingCode}
        loadByCode={p.loadByCode}
        errorCode={p.errorCode}
        fullEvent={p.fullEvent}
        ev={p.ev}
        chartData={p.chartData}
        ticketMig={p.ticketMig}
        sortedEntries={p.sortedEntries}
      />

      <EventsListSection
        limit={p.limit}
        setLimit={p.setLimit}
        loading={p.loading}
        load={p.load}
        error={p.error}
        meta={p.meta}
        rows={p.rows}
      />
    </div>
  )
}

export default withAdmin(ConsultesMcpPage)
