'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  filterUsersForInviteSearch,
  type InviteUserOption,
} from '@/lib/messaging/userSearch'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  users: InviteUserOption[]
  excludeIds: Set<string>
  onPick: (user: InviteUserOption) => void
  disabled?: boolean
  adding?: boolean
  placeholder?: string
  variant?: 'default' | 'icon'
}

export default function UserInviteSearchCombobox({
  users,
  excludeIds,
  onPick,
  disabled = false,
  adding = false,
  placeholder = 'Afegir participant…',
  variant = 'default',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const results = useMemo(
    () => filterUsersForInviteSearch(users, search, excludeIds),
    [users, search, excludeIds]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'icon' ? (
          <button
            type="button"
            disabled={disabled || adding}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full transition',
              'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
              (disabled || adding) && 'cursor-not-allowed opacity-50'
            )}
            title="Afegir participant"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || adding}
            className="h-9 gap-2 rounded-full px-3 text-xs"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{placeholder}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,360px)] p-2" align="end">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca per nom, departament o rol…"
          className="mb-2"
          autoFocus
        />
        <ul className="max-h-56 space-y-0.5 overflow-y-auto">
          {results.length === 0 ? (
            <li className={cn(typography('bodySm'), 'px-2 py-3 text-slate-500')}>
              Cap usuari trobat.
            </li>
          ) : (
            results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-slate-100"
                  onClick={() => {
                    onPick(user)
                    setOpen(false)
                  }}
                >
                  <p className="text-sm font-medium text-slate-900">{user.name}</p>
                  <p className={cn(typography('bodyXs'), 'text-slate-500')}>
                    {[user.department, user.role].filter(Boolean).join(' · ')}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
