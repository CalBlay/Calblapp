import { chatTheme } from '@/components/messaging/chatTheme'
import Image from 'next/image'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import type { Message } from '../types'
import { initials, timeLabel } from '../utils'

type MessageWithReadCount = Message & {
  readCount?: number
}

type Props = {
  messages: Message[]
  userId?: string
  canCreateTicket: boolean
  creatingTicketId: string | null
  ticketTypePickerId: string | null
  readOnly?: boolean
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
  readOnly = false,
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
        .map((message) => {
          const isMine = Boolean(userId) && message.senderId === userId
          const readCount = (message as MessageWithReadCount).readCount ?? 0
          const ticks =
            isMine && readCount > 0 ? '\u2713\u2713' : isMine ? '\u2713' : ''

          return (
            <div key={message.id} className={`space-y-1 ${isMine ? 'flex flex-col items-end' : ''}`}>
              <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
                {!isMine && (
                  <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-100 flex items-center justify-center text-[10px] font-semibold">
                    {initials(message.senderName)}
                  </span>
                )}
                <span>
                  {isMine ? 'Tu' : message.senderName || 'Usuari'} · {timeLabel(message.createdAt)}
                  {message.visibility === 'direct' ? ' · Directe' : ''}
                </span>
                {ticks ? <span className="text-[10px] text-gray-400">{ticks}</span> : null}
                {isMine && !readOnly && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => onDelete(message.id)}
                    title="Esborrar missatge"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div
                className={`text-sm rounded-lg p-2 space-y-2 max-w-[85%] ${
                  isMine
                    ? chatTheme.bubbleOutgoing
                    : 'bg-gray-100 text-gray-900 dark:bg-slate-800 dark:text-slate-100'
                }`}
              >
                {message.surveyType === 'quadrant-availability' && message.surveyId ? (
                  <div className={`space-y-2 ${isMine ? 'text-white' : ''}`}>
                    <div className="font-semibold">Sondeig de disponibilitat</div>
                    <div className="text-xs opacity-90">
                      {message.surveyPayload?.eventName || 'Servei'} · {message.surveyPayload?.serviceDate || '-'}
                    </div>
                    <div className="text-xs opacity-90">
                      {message.surveyPayload?.startTime || '--:--'} - {message.surveyPayload?.endTime || '--:--'}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {[
                        ['yes', 'Sí'],
                        ['no', 'No'],
                        ['maybe', 'Potser'],
                      ].map(([value, label]) => {
                        const active = message.surveyState === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => onRespondSurvey(message.surveyId as string, value as 'yes' | 'no' | 'maybe')}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              active
                                ? isMine
                                  ? 'border-white bg-white text-amber-700'
                                  : chatTheme.bubbleOutgoingAccent
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
                {message.body && <div>{message.body}</div>}
                {message.imageUrl && (
                  <a href={message.imageUrl} target="_blank" rel="noopener noreferrer">
                    <div className="relative h-64 w-64 max-w-full overflow-hidden rounded border dark:border-slate-700">
                      <Image
                        src={message.imageUrl}
                        alt="Imatge"
                        fill
                        className="object-contain"
                      />
                    </div>
                  </a>
                )}
                {message.fileUrl && (
                  <a
                    href={message.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-block underline ${
                      isMine ? 'text-white' : chatTheme.bubbleLink
                    }`}
                  >
                    {message.fileName || 'Descarregar fitxer'}
                  </a>
                )}
              </div>
              {((canCreateTicket && message.visibility === 'channel') || message.ticketId) && (
                <div className="text-xs text-gray-600 dark:text-slate-300">
                  {message.ticketId ? (
                    <Link
                      href={`/menu/manteniment/${
                        message.ticketType === 'deco' ? 'tickets-deco' : 'tickets'
                      }?ticket=${message.ticketId}`}
                      className={`underline ${chatTheme.bubbleLinkHover}`}
                    >
                      Veure ticket {message.ticketCode ? `· ${message.ticketCode}` : ''}
                    </Link>
                  ) : ticketTypePickerId === message.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onCreateTicket(message, 'maquinaria')}
                        disabled={creatingTicketId === message.id}
                        className={`underline ${chatTheme.bubbleLinkHover}`}
                      >
                        Maquinària
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => onCreateTicket(message, 'deco')}
                        disabled={creatingTicketId === message.id}
                        className={`underline ${chatTheme.bubbleLinkHover}`}
                      >
                        Deco
                      </button>
                      <button
                        type="button"
                        onClick={() => onPickTicketType(null)}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                        aria-label="Cancel·lar"
                      >
                        {'\u00D7'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPickTicketType(message.id)}
                      disabled={creatingTicketId === message.id}
                      className={`underline ${chatTheme.bubbleLinkHover}`}
                    >
                      {creatingTicketId === message.id ? 'Creant ticket\u2026' : 'Crear ticket'}
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
