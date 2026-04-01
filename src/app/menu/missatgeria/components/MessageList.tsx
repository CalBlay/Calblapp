'use client'

import React from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import { Message } from '../types'
import { initials, timeLabel } from '../utils'

type Props = {
  messages: Message[]
  userId?: string
  canCreateTicket: boolean
  creatingTicketId: string | null
  ticketTypePickerId: string | null
  onDelete: (id: string) => void
  onCreateTicket: (message: Message, type: 'maquinaria' | 'deco') => void
  onPickTicketType: (messageId: string | null) => void
  onRespondSurvey: (surveyId: string, response: 'yes' | 'no' | 'maybe') => void
}

export default function MessageList({
  messages,
  userId,
  canCreateTicket,
  creatingTicketId,
  ticketTypePickerId,
  onDelete,
  onCreateTicket,
  onPickTicketType,
  onRespondSurvey,
}: Props) {
  return (
    <div className="space-y-3">
      {messages
        .slice()
        .reverse()
        .map((m) => {
          const isMine = userId && m.senderId === userId
          const ticks = isMine && (m as any)?.readCount > 0 ? '✓✓' : isMine ? '✓' : ''
          return (
            <div key={m.id} className={`space-y-1 ${isMine ? 'flex flex-col items-end' : ''}`}>
              <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
                {!isMine && (
                  <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-100 flex items-center justify-center text-[10px] font-semibold">
                    {initials(m.senderName)}
                  </span>
                )}
                <span>
                  {isMine ? 'Tu' : m.senderName || 'Usuari'} · {timeLabel(m.createdAt)}
                  {m.visibility === 'direct' ? ' · Directe' : ''}
                </span>
                {ticks && <span className="text-[10px] text-gray-400">{ticks}</span>}
                {isMine && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => onDelete(m.id)}
                    title="Esborrar missatge"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div
                className={`text-sm rounded-lg p-2 space-y-2 max-w-[85%] ${
                  isMine
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                {m.surveyType === 'quadrant-availability' && m.surveyId ? (
                  <div className={`space-y-2 ${isMine ? 'text-white' : ''}`}>
                    <div className="font-semibold">
                      Sondeig de disponibilitat
                    </div>
                    <div className="text-xs opacity-90">
                      {m.surveyPayload?.eventName || 'Servei'} · {m.surveyPayload?.serviceDate || '-'}
                    </div>
                    <div className="text-xs opacity-90">
                      {m.surveyPayload?.startTime || '--:--'} - {m.surveyPayload?.endTime || '--:--'}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        ['yes', 'Sí'],
                        ['no', 'No'],
                        ['maybe', 'Potser'],
                      ].map(([value, label]) => {
                        const active = m.surveyState === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => onRespondSurvey(m.surveyId as string, value as 'yes' | 'no' | 'maybe')}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              active
                                ? isMine
                                  ? 'border-white bg-white text-emerald-700'
                                  : 'border-emerald-600 bg-emerald-600 text-white'
                                : isMine
                                ? 'border-white/40 text-white hover:bg-white/10'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {m.body && <div>{m.body}</div>}
                {m.imageUrl && (
                  <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                    <img
                      src={m.imageUrl}
                      alt="Imatge"
                      className="max-h-64 rounded border dark:border-slate-700"
                    />
                  </a>
                )}
                {m.fileUrl && (
                  <a
                    href={m.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-block underline ${
                      isMine ? 'text-white' : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {m.fileName || 'Descarregar fitxer'}
                  </a>
                )}
              </div>
              {((canCreateTicket && m.visibility === 'channel') || m.ticketId) && (
                <div className="text-xs text-gray-600 dark:text-slate-300">
                  {m.ticketId ? (
                    <Link
                      href={`/menu/manteniment/${
                        m.ticketType === 'deco' ? 'tickets-deco' : 'tickets'
                      }?ticket=${m.ticketId}`}
                      className="underline hover:text-emerald-600"
                    >
                      Veure ticket {m.ticketCode ? `· ${m.ticketCode}` : ''}
                    </Link>
                  ) : ticketTypePickerId === m.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onCreateTicket(m, 'maquinaria')}
                        disabled={creatingTicketId === m.id}
                        className="underline hover:text-emerald-600"
                      >
                        Maquinària
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => onCreateTicket(m, 'deco')}
                        disabled={creatingTicketId === m.id}
                        className="underline hover:text-emerald-600"
                      >
                        Deco
                      </button>
                      <button
                        type="button"
                        onClick={() => onPickTicketType(null)}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                        aria-label="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPickTicketType(m.id)}
                      disabled={creatingTicketId === m.id}
                      className="underline hover:text-emerald-600"
                    >
                      {creatingTicketId === m.id ? 'Creant ticket…' : 'Crear ticket'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      {messages.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-slate-400">Encara no hi ha missatges.</p>
      )}
    </div>
  )
}
