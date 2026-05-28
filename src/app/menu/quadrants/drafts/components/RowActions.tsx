// file: src/app/menu/quadrants/drafts/components/RowActions.tsx
'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'

export default function RowActions({
  onEdit,
  onDelete,
  disabled,
  canEdit = true,
  canDelete = true,
}: {
  onEdit: () => void
  onDelete: () => void
  disabled: boolean
  canEdit?: boolean
  canDelete?: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-2 sm:gap-1 ml-1 sm:ml-2">
      {/* Editar */}
      <Button
        onClick={onEdit}
        disabled={disabled || !canEdit}
        variant="outline"
        className="rounded-full px-3 py-1 sm:size-icon"
      >
        <Edit className="w-4 h-4" />
      </Button>

      {/* Esborrar */}
      <Button
        onClick={onDelete}
        disabled={disabled || !canDelete}
        variant="ghost"
        className="rounded-full px-3 py-1 sm:size-icon"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )
}
