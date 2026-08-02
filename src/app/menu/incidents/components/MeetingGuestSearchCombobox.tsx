'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ChevronsUpDown, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { filterUsersForGuestSearch, type AppUserRow } from '@/lib/incidentMeetingAttendees'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'

type Props = {
  users: AppUserRow[]
  excludeIds: Set<string>
  onPick: (user: AppUserRow) => void
  disabled?: boolean
}

export default function MeetingGuestSearchCombobox({
  users,
  excludeIds,
  onPick,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const results = useMemo(
    () => filterUsersForGuestSearch(users, search, excludeIds),
    [users, search, excludeIds]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between gap-2 sm:w-auto sm:min-w-[280px]"
        >
          <span className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 shrink-0 text-slate-500" />
            Afegir convidat…
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,360px)] p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nom, correu o departament…"
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
                    {user.email}
                    {user.department ? ` · ${user.department}` : ''}
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
