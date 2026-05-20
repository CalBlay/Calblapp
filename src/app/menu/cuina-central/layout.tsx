'use client'

import { RoleGuard } from '@/lib/withRoleGuard'
import CuinaCentralSubnav from './components/CuinaCentralSubnav'
import { CuinaCentralMaintenanceTicketShell } from './components/CuinaCentralMaintenanceTicket'

export default function CuinaCentralLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <CuinaCentralMaintenanceTicketShell>
        <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-4">
          <CuinaCentralSubnav />
          {children}
        </div>
      </CuinaCentralMaintenanceTicketShell>
    </RoleGuard>
  )
}
