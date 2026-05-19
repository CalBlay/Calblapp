'use client'

import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

export default function TicketJourneyModalShell({ title, subtitle, onClose, children, footer }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:px-4">
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-2xl md:max-h-[90vh] md:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-ticket-title"
      >
        <div className="shrink-0 rounded-t-3xl border-b border-slate-100 bg-white px-4 pb-4 pt-3 safe-area-top md:px-6">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <h2 id="journey-ticket-title" className="text-lg font-semibold text-gray-900">
                {title}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            </div>
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-slate-200 text-xl text-gray-500"
              onClick={onClose}
              aria-label="Tancar"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">{children}</div>

        <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
          {footer}
        </div>
      </div>
    </div>
  )
}
