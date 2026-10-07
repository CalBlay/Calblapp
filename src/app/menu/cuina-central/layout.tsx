'use client'

import { usePathname } from 'next/navigation'
import CuinaCentralSubnav from './components/CuinaCentralSubnav'
import { CuinaCentralMaintenanceTicketShell } from './components/CuinaCentralMaintenanceTicket'
import MaintenancePermissionGate from '@/app/menu/manteniment/components/MaintenancePermissionGate'
import { cn } from '@/lib/utils'

export default function CuinaCentralLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const isMaintenanceWorkspace = pathname.startsWith('/menu/cuina-central/manteniment')

  return (
    <MaintenancePermissionGate path="/menu/cuina-central">
      <CuinaCentralMaintenanceTicketShell>
        <div
          className={cn(
            'w-full pb-10 pt-4',
            !isMaintenanceWorkspace && 'mx-auto max-w-[1400px] px-4'
          )}
        >
          <div className={cn(isMaintenanceWorkspace && 'px-4')}>
            <CuinaCentralSubnav />
          </div>
          {children}
        </div>
      </CuinaCentralMaintenanceTicketShell>
    </MaintenancePermissionGate>
  )
}
