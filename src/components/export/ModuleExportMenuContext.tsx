'use client'

/**
 * Patró unificat (Espais, logística, roba personal…): la impressora va sempre a
 * `ModuleHeader` → prop `actions={<ModuleExportMenuActions />}` dins del provider.
 *
 * Des de cada vista o pestanya: `useRegisterModuleExportMenu(exportMenuItems)` amb
 * `exportMenuItems = useMemo(() => [...], [handlers])`.
 */

import React, { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import ExportMenu from '@/components/export/ExportMenu'
import type { ExportMenuItem } from '@/components/export/ExportMenu'

const ExportItemsStateContext = createContext<ExportMenuItem[] | null | undefined>(undefined)
const SetExportItemsContext = createContext<Dispatch<
  SetStateAction<ExportMenuItem[] | null>
> | null>(null)

export function ModuleExportMenuProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ExportMenuItem[] | null>(null)
  return (
    <SetExportItemsContext.Provider value={setItems}>
      <ExportItemsStateContext.Provider value={items}>{children}</ExportItemsStateContext.Provider>
    </SetExportItemsContext.Provider>
  )
}

/** Col·locar a la dreta del gradient del ModuleHeader (mateix lloc a tots els mòduls). */
export function ModuleExportMenuActions() {
  const items = useContext(ExportItemsStateContext)
  if (items == null || !items.length) return null
  return <ExportMenu items={items} ariaLabel="Exportar" />
}

export function useRegisterModuleExportMenu(items: ExportMenuItem[] | null) {
  const setItems = useContext(SetExportItemsContext)
  useEffect(() => {
    if (!setItems) return
    setItems(items && items.length ? items : null)
  }, [setItems, items])

  useEffect(() => {
    return () => {
      setItems?.(null)
    }
  }, [setItems])
}
