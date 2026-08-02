'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CalendarMailGroupsPanel from '@/components/calendar/CalendarMailGroupsPanel'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { CALENDAR_PERM } from '@/lib/calendar/calendarPermissions'

export default function CalendarMailGroupsPage() {
  const router = useRouter()
  const { uiActions, ready } = useUiPermissions()
  const canManage = uiActions[CALENDAR_PERM.manageMailGroups] === true

  useEffect(() => {
    if (!ready) return
    if (!canManage) router.replace('/menu/calendar')
  }, [ready, canManage, router])

  if (!ready) {
    return <p className="p-4 text-sm text-slate-500">Carregant…</p>
  }

  if (!canManage) return null

  return <CalendarMailGroupsPanel />
}
