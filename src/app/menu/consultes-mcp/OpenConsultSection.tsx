'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ExportMenuItem } from '@/components/export/ExportMenu'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { McpErrorBanner } from './mcp-helpers'
import { OpenChatAnswerCard } from './OpenChatAnswerCard'
import type { McpUiError, OpenChatAnswer } from './types'

function OpenConsultSectionInner({
  openQuestion,
  setOpenQuestion,
  openRich,
  setOpenRich,
  openLoading,
  openError,
  openAnswer,
  submitOpenQuestion,
  openChatExportItems,
}: {
  openQuestion: string
  setOpenQuestion: (v: string) => void
  openRich: boolean
  setOpenRich: (v: boolean) => void
  openLoading: boolean
  openError: McpUiError | null
  openAnswer: OpenChatAnswer | null
  submitOpenQuestion: () => void
  openChatExportItems: ExportMenuItem[]
}) {
  return (
    <section
      id="consulta-oberta"
      className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4 sm:p-5 scroll-mt-4"
    >
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-6 w-6 text-violet-700" />
        <h2 className="text-lg font-semibold text-violet-950">Consulta oberta</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Preguntes en llenguatge natural amb sortida professional:{' '}
        <strong>resum executiu</strong>, <strong>taules</strong> i <strong>gràfics</strong> (barres /
        línies) quan les dades ho permeten. El MCP prioritza eines barates; el mode només text és més
        econòmic. Preguntes idèntiques es cachegen uns minuts. Cal{' '}
        <code className="text-xs bg-white px-1 rounded">OPENAI_API_KEY</code> al Cloud Run (
        <code className="text-xs bg-white px-1 rounded">gpt-4o-mini</code> recomanat).
      </p>
      <div className="space-y-2">
        <label htmlFor="open-question" className="text-sm font-medium">
          Pregunta
        </label>
        <Textarea
          id="open-question"
          placeholder="Ex.: Quina va ser la venda total del gener del 2026?"
          className="min-h-[100px] border-2 border-violet-300 bg-white text-slate-900 shadow-sm"
          value={openQuestion}
          onChange={(e) => setOpenQuestion(e.target.value)}
        />
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 rounded border-violet-400 text-violet-700"
          checked={openRich}
          onChange={(e) => setOpenRich(e.target.checked)}
        />
        <span>
          <strong>Mode informe</strong>: demana al model una peça JSON amb taules i gràfic (més tokens;
          millor per presentacions). Desmarca per resposta curta només text.
        </span>
      </label>
      <Button
        type="button"
        size="lg"
        onClick={submitOpenQuestion}
        disabled={openLoading}
        className={cn(
          'min-h-11 border-2 border-violet-900 bg-violet-700 text-base font-semibold text-white shadow-md',
          'hover:bg-violet-800 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2'
        )}
      >
        {openLoading ? (
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <MessageSquareText className="mr-2 h-5 w-5" />
        )}
        Enviar consulta
      </Button>
      {openError ? <McpErrorBanner err={openError} /> : null}
      {openAnswer ? (
        <OpenChatAnswerCard openAnswer={openAnswer} exportItems={openChatExportItems} />
      ) : null}
    </section>
  )
}

export const OpenConsultSection = memo(OpenConsultSectionInner)
