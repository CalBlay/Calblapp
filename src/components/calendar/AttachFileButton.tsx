// file: src/components/calendar/AttachFileButton.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import SharePointPicker from './SharePointFilePicker'
import { Paperclip } from 'lucide-react'
import { MotionDiv } from '@/lib/lazyMotion'

type Props = {
  collection: 'stage_verd' | 'stage_taronja' | 'stage_taronja'
  docId: string
  disabled?: boolean
  fieldBase?: string
  existingKeys?: string[]
  onAdded?: (att: { name: string; url: string; key: string }) => void
}

export default function AttachFileButton({
  collection,
  docId,
  disabled = false,
  fieldBase = 'file',
  existingKeys = [],
  onAdded,
}: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Troba el primer camp disponible: file1, file2, file3...
  const findNextFileKey = (currentKeys: string[]) => {
    const used = new Set(
      currentKeys
        .filter((k) => k.startsWith(fieldBase))
        .map((k) => parseInt(k.replace(fieldBase, ''), 10))
        .filter((n) => !Number.isNaN(n))
    )
    let i = 1
    while (used.has(i)) i++
    return `${fieldBase}${i}`
  }

  // Quan l'usuari selecciona un fitxer del picker
  async function handleSelected(item: { id: string; name: string; url: string }) {
    if (!docId) {
      alert("Cal desar l'esdeveniment abans d'adjuntar documents.")
      return
    }

    setSaving(true)
    try {
      const publicUrl = item.url // ja ve en format valid via /api/sharepoint/file
      const nextKey = findNextFileKey(existingKeys)

      const res = await fetch(`/api/calendar/manual/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          field: nextKey,
          url: publicUrl,
          name: item.name,
        }),
      })
      if (!res.ok) throw new Error('Error desant el fitxer')

      onAdded?.({ name: item.name, url: publicUrl, key: nextKey })
    } catch (err) {
      console.error('Error desant fitxer:', err)
      alert("No s'ha pogut desar el fitxer.")
    } finally {
      setSaving(false)
    }
  }

  const scaleAnimation = disabled
    ? {}
    : {
        whileTap: { scale: 0.94 },
        whileHover: { scale: 1.02 },
      }

  return (
    <>
      <MotionDiv {...scaleAnimation}>
        <Button
          size="sm"
          className={`w-full sm:w-auto shadow-sm font-medium flex items-center gap-2
            ${
              disabled
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          disabled={disabled || saving}
          onClick={() => {
            if (!disabled) setOpen(true)
          }}
        >
          <Paperclip className="h-4 w-4" />
          {saving ? 'Desant...' : 'Adjuntar fitxer (SharePoint)'}
        </Button>
      </MotionDiv>

      <SharePointPicker open={open} onOpenChange={setOpen} onSelected={handleSelected} />
    </>
  )
}
