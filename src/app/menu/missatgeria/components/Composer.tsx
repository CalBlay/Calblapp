'use client'

import React from 'react'
import Image from 'next/image'
import { Paperclip, Send } from 'lucide-react'
import { Member, PendingImage } from '../types'

type Props = {
  typingUsers: Record<string, number>
  pendingImage: PendingImage | null
  pendingFileName?: string | null
  imageError: string | null
  imageUploading: boolean
  isSending: boolean
  messageText: string
  onTextChange: (value: string) => void
  onRemoveImage: () => void
  onRemovePendingFile?: () => void
  onPickFile: () => void
  onSend: () => void
  onQuick: (value: string) => void
  mentionTarget: Member | null
  mentionOpen: boolean
  mentionQuery: string
  members: Member[]
  onSelectMention: (m: Member) => void
  isReadOnly: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  onFileChange: (file: File | null) => void
  fileAccept?: string
}

export default function Composer({
  typingUsers,
  pendingImage,
  pendingFileName,
  imageError,
  imageUploading,
  isSending,
  messageText,
  onTextChange,
  onRemoveImage,
  onRemovePendingFile,
  onPickFile,
  onSend,
  onQuick,
  mentionTarget,
  mentionOpen,
  mentionQuery,
  members,
  onSelectMention,
  isReadOnly,
  fileInputRef,
  onFileChange,
  fileAccept,
}: Props) {
  return (
    <div className="border-t p-3 space-y-2 bg-white dark:bg-slate-900 fixed bottom-0 left-0 right-0 lg:sticky lg:bottom-0 pb-[env(safe-area-inset-bottom)] dark:border-slate-800">
      {Object.keys(typingUsers).length > 0 && (
        <div className="text-xs text-gray-500 dark:text-slate-400">
          S'està escrivint…
        </div>
      )}
      {pendingImage && (
        <div className="flex items-center gap-3 text-sm">
          <div className="relative h-16 w-16 overflow-hidden rounded border dark:border-slate-700">
            <Image
              src={pendingImage.url}
              alt="Imatge adjunta"
              fill
              className="object-cover"
            />
          </div>
          <button
            type="button"
            className="text-red-600 text-xs"
            onClick={onRemoveImage}
          >
            Eliminar imatge
          </button>
        </div>
      )}
      {!pendingImage && pendingFileName && (
        <div className="flex items-center gap-3 text-sm">
          <div className="rounded border px-3 py-2 dark:border-slate-700">
            {pendingFileName}
          </div>
          <button
            type="button"
            className="text-red-600 text-xs"
            onClick={onRemovePendingFile}
          >
            Eliminar fitxer
          </button>
        </div>
      )}
      {imageError && <div className="text-xs text-red-600">{imageError}</div>}
      <div className="flex flex-wrap gap-2">
        {['Rebut', 'Ho reviso', 'Fet'].map((quick) => (
          <button
            key={quick}
            type="button"
            className="text-xs border rounded-full px-3 py-1 text-gray-600 hover:text-gray-800 dark:text-slate-300 dark:border-slate-700 dark:hover:text-white"
            onClick={() => onQuick(quick)}
            disabled={isReadOnly}
          >
            {quick}
          </button>
        ))}
      </div>
      {mentionTarget && (
        <div className="text-xs text-emerald-700">
          Directe a: <strong>{mentionTarget.userName}</strong>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={fileAccept || 'image/*'}
          className="hidden"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          className="border rounded px-2 py-1 text-gray-600 hover:text-gray-800 hover:border-gray-400 dark:text-slate-300 dark:border-slate-700 dark:hover:text-white dark:hover:border-slate-500"
          onClick={onPickFile}
          title="Adjuntar fitxer"
          disabled={imageUploading || isReadOnly}
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm bg-transparent text-gray-900 dark:text-slate-100 dark:border-slate-700"
          placeholder="Escriu el missatge..."
          value={messageText}
          onChange={(e) => onTextChange(e.target.value)}
          disabled={isReadOnly}
        />
        <button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full"
          onClick={onSend}
          disabled={imageUploading || isReadOnly || isSending}
          title="Enviar"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {mentionOpen && (
        <div className="border rounded-lg bg-white dark:bg-slate-900 dark:border-slate-700 shadow-sm max-h-40 overflow-y-auto">
          {members
            .filter((m) => m.userName.toLowerCase().includes(mentionQuery))
            .map((m) => (
              <button
                key={m.userId}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm"
                onClick={() => onSelectMention(m)}
              >
                {m.userName}
              </button>
            ))}
          {members.filter((m) => m.userName.toLowerCase().includes(mentionQuery)).length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-slate-400">
              Cap usuari
            </div>
          )}
        </div>
      )}
    </div>
  )
}
