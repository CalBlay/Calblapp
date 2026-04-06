'use client'

import React, { useState, useMemo } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Incident } from '@/hooks/useIncidents'
import {
  buildIncidentsMeetingMinutesHtml,
  buildMeetingFilterSummaryLines,
  type MeetingMinutesFilters,
} from '@/lib/incidentsMeetingMinutes'
import { typography } from '@/lib/typography'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  incidents: Incident[]
  filters: MeetingMinutesFilters
  generatedByLabel?: string
}

export default function MeetingMinutesDialog({
  open,
  onOpenChange,
  incidents,
  filters,
  generatedByLabel,
}: Props) {
  const [notes, setNotes] = useState('')

  const filterLines = useMemo(() => buildMeetingFilterSummaryLines(filters), [filters])

  const handleGenerate = () => {
    const html = buildIncidentsMeetingMinutesHtml({
      incidents,
      filters,
      meetingNotes: notes,
      generatedAtIso: new Date().toISOString(),
      generatedByLabel,
    })
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 350)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setNotes('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg md:max-w-xl" lockDismissOnOutside>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-600 shrink-0" aria-hidden />
            Acta de reunió
          </DialogTitle>
          <DialogDescription>
            Es genera a partir de la vista actual (període i filtres del tauler). Opcionalment pots afegir notes
            que surtin al document abans del detall per dia i esdeveniment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className={`${typography('label')} mb-1.5`}>Resum de filtres</p>
            <ul className={`list-disc pl-5 space-y-0.5 ${typography('bodyXs')}`}>
              {filterLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className={typography('bodySm')}>
            Incidències incloses: <strong>{incidents.length}</strong>
          </p>
          <div className="space-y-1.5">
            <label htmlFor="meeting-notes" className={typography('label')}>
              Notes de la reunió (opcional)
            </label>
            <Textarea
              id="meeting-notes"
              placeholder="Acords, responsables, següents passos…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="min-h-[120px] text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Tancar
          </Button>
          <Button type="button" onClick={handleGenerate}>
            Generar acta (imprimir / PDF)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
