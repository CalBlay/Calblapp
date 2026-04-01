import React, { type ReactNode } from 'react'
import RowEditor from './RowEditor'
import { buildDisplayItems } from './draftsTableDisplayUtils'
import type { GroupDef, Role, Row } from './types'

type DraftsTableDesktopProps = {
  hasInlineEditor: boolean
  currentEditingRow: Row | null
  groupDefs: GroupDef[]
  isLocked: boolean
  isServeisDept: boolean
  canManageGroups: boolean
  showStructuredGroups: boolean
  rows: Row[]
  renderRow: (row: Row, index: number) => ReactNode
  availableForEditor: {
    responsables: any[]
    conductors: any[]
    treballadors: any[]
  }
  renderDisplayItems: (items: ReturnType<typeof buildDisplayItems>) => ReactNode
  canEditMeetingPoint: (row: Row | null) => boolean
  canEditArrivalTime: (row: Row | null) => boolean
  groupHasDriverController: (groupId?: string) => boolean
  addRowToGroup: (role: Role, groupId?: string) => void
  addEttRow: (groupId?: string) => void
  addCenterExternalExtra: (groupId?: string) => void
  isGroupCollapsed: (groupId?: string | null) => boolean
  toggleGroupCollapsed: (groupId?: string | null) => void
  groupHeaderToggleIcon: (groupId?: string | null) => ReactNode
  removeGroup: (groupId: string) => void
  addGroup: () => void
  patchRow: (patch: Partial<Row>) => void
  endEdit: () => void
  revertRow: () => void
}

export default function DraftsTableDesktop({
  hasInlineEditor,
  currentEditingRow,
  groupDefs,
  isLocked,
  isServeisDept,
  canManageGroups,
  showStructuredGroups,
  rows,
  renderRow,
  availableForEditor,
  renderDisplayItems,
  canEditMeetingPoint,
  canEditArrivalTime,
  groupHasDriverController,
  addRowToGroup,
  addEttRow,
  addCenterExternalExtra,
  isGroupCollapsed,
  toggleGroupCollapsed,
  groupHeaderToggleIcon,
  removeGroup,
  addGroup,
  patchRow,
  endEdit,
  revertRow,
}: DraftsTableDesktopProps) {
  return (
    <div className="hidden sm:block">
      <div className="w-full min-w-0 overflow-x-auto">
        <div className="flex flex-col divide-y">
          {showStructuredGroups ? (
            <>
              {groupDefs.map((group, gidx) => {
                const groupId = group.id || `group-${gidx + 1}`
                const isCollapsed = isGroupCollapsed(groupId)
                return (
                  <React.Fragment key={groupId}>
                    <div className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border-b flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapsed(groupId)}
                        className="flex items-center gap-2 text-left hover:text-slate-900"
                      >
                        <span>{groupHeaderToggleIcon(groupId)}</span>
                        <span>Grup {gidx + 1}</span>
                      </button>
                      <div className="flex items-center gap-3">
                        {!isLocked && groupDefs.length > 1 && (
                          <button
                            onClick={() => removeGroup(groupId)}
                            className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                          >
                            Eliminar grup
                          </button>
                        )}
                      </div>
                    </div>
                    {!isCollapsed && renderDisplayItems(buildDisplayItems(rows, groupId))}
                    {!isLocked && !isCollapsed && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 bg-slate-50 border-b">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => addRowToGroup('treballador', groupId)}
                            className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                          >
                            + Treballador
                          </button>
                          <button
                            onClick={() => addEttRow(groupId)}
                            className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
                          >
                            + ETT
                          </button>
                          <button
                            onClick={() => addCenterExternalExtra(groupId)}
                            className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                          >
                            + Extra C.Extern
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
              {!isLocked && canManageGroups && (
                <div className="flex justify-start px-3 py-3 bg-slate-50 border-b">
                  <button
                    onClick={addGroup}
                    className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100"
                  >
                    + Grup
                  </button>
                </div>
              )}
              {renderDisplayItems(buildDisplayItems(rows))}
            </>
          ) : (
            renderDisplayItems(buildDisplayItems(rows))
          )}
        </div>
      </div>

      {hasInlineEditor && currentEditingRow && (
        <div className="lg:hidden bg-blue-50/40 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
          <RowEditor
            row={currentEditingRow}
            available={availableForEditor}
            isServeisDept={isServeisDept}
            allowExternalWorkerName={Boolean(currentEditingRow.isExternal)}
            canEditMeetingPoint={canEditMeetingPoint(currentEditingRow)}
            groupHasDriverController={groupHasDriverController(currentEditingRow.groupId)}
            canEditArrivalTime={canEditArrivalTime(currentEditingRow)}
            onPatch={patchRow}
            onClose={endEdit}
            onRevert={revertRow}
            isLocked={isLocked}
          />
        </div>
      )}
    </div>
  )
}
