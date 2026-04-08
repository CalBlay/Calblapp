// file: src/components/export/ExportMenu.tsx
'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ExportMenuItem = {
  label: string
  onClick: () => void | Promise<void>
  disabled?: boolean
}

interface ExportMenuProps {
  items: ExportMenuItem[]
  ariaLabel?: string
  align?: 'start' | 'end'
}

export default function ExportMenu({
  items,
  ariaLabel = 'Exportar',
  align = 'end',
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={ariaLabel}>
          <Printer className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onClick={() => {
              void Promise.resolve(item.onClick()).catch((err) => console.error(err))
            }}
            disabled={item.disabled}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
