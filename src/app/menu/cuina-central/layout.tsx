'use client'

import { usePathname } from 'next/navigation'
import CuinaCentralSubnav from './components/CuinaCentralSubnav'
import { CuinaCentralMaintenanceTicketShell } from './components/CuinaCentralMaintenanceTicket'
import MaintenancePermissionGate from '@/app/menu/manteniment/components/MaintenancePermissionGate'
import { cn } from '@/lib/utils'

export default function CuinaCentralLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const isWideWorkspace =
    pathname.startsWith('/menu/cuina-central/manteniment') ||
    pathname.startsWith('/menu/cuina-central/dades')

  return (
    <MaintenancePermissionGate path="/menu/cuina-central">
      <CuinaCentralMaintenanceTicketShell>
        <div
          className={cn(
            'w-full pb-10 pt-4',
            !isWideWorkspace && 'mx-auto max-w-[1400px] px-4'
          )}
        >
          <div className={cn(isWideWorkspace && 'px-4')}>
            <CuinaCentralSubnav />
          </div>
          {children}
        </div>
      </CuinaCentralMaintenanceTicketShell>
    </MaintenancePermissionGate>
  )
}
