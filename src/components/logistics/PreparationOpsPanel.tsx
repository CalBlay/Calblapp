'use client'

import { useMemo } from 'react'
import OpsWorkspacePanel from '@/components/messaging/OpsWorkspacePanel'
import { createPreparationOpsWorkspaceConfig } from '@/lib/messaging/preparationOpsWorkspace'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'

type Props = {
  rowId: string
  eventTitle: string
  warehouseCode: PreparationWarehouseCode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function PreparationOpsPanel({
  rowId,
  eventTitle,
  warehouseCode,
  open,
  onOpenChange,
}: Props) {
  const config = useMemo(
    () => createPreparationOpsWorkspaceConfig({
      rowId,
      eventTitle,
      warehouse: warehouseCode,
    }),
    [eventTitle, rowId, warehouseCode]
  )

  return (
    <OpsWorkspacePanel
      open={open}
      onOpenChange={onOpenChange}
      config={config}
      showRoomList={false}
    />
  )
}
