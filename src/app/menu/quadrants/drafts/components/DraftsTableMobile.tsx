import type { ReactNode } from 'react'
import RowEditor from './RowEditor'
import { buildDisplayItems } from './draftsTableDisplayUtils'
import type { Role, Row } from './types'

type GroupDef = {
  id?: string | null
}

type DraftsTableMobileProps = {
  currentEditingRow: Row | null
  editIdx: number | null
  groupDefs: GroupDef[]
  isLocked: boolean
  isServeisDept: boolean
  isCuinaDept: boolean
  canManageGroups: boolean
  showStructuredGroups: boolean
  showConductorButtons: boolean
  rows: Row[]
  defaultGroupId?: string
  availableForEditor: {
    responsables: any[]
    conductors: any[]
    treballadors: any[]
  }
  renderDisplayItemsMobile: (items: ReturnType<typeof buildDisplayItems>) => ReactNode
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
  startEdit: (index: number) => void
  deleteRow: (index: number) => void
  patchRow: (patch: Partial<Row>) => void
  endEdit: () => void
  revertRow: () => void
}

export default function DraftsTableMobile({
  currentEditingRow,
  editIdx,
  groupDefs,
  isLocked,
  isServeisDept,
  isCuinaDept,
  canManageGroups,
  showStructuredGroups,
  showConductorButtons,
  rows,
  defaultGroupId,
  availableForEditor,
  renderDisplayItemsMobile,
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
  startEdit,
  deleteRow,
  patchRow,
  endEdit,
  revertRow,
}: DraftsTableMobileProps) {
  return (
    <>
      <div className="block sm:hidden divide-y">
        {showStructuredGroups ? (
          <>
            {groupDefs.map((group, gidx) => {
              const groupId = group.id || `group-${gidx + 1}`
              const isCollapsed = isGroupCollapsed(groupId)
              return (
                <div key={groupId} className="divide-y">
                  <div className="px-3 py-2 text-xs text-slate-600 bg-slate-50 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapsed(groupId)}
                      className="flex items-center gap-2 font-semibold text-slate-700"
                    >
                      <span>{groupHeaderToggleIcon(groupId)}</span>
                      <span>Grup {gidx + 1}</span>
                    </button>
                    {!isLocked && groupDefs.length > 1 && (
                      <button
                        onClick={() => removeGroup(groupId)}
                        className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  {!isCollapsed && renderDisplayItemsMobile(buildDisplayItems(rows, groupId))}
                  {!isLocked && !isCollapsed && (
                    <div className="flex flex-wrap gap-2 px-3 py-3 bg-slate-50">
                      <button
                        onClick={() => addRowToGroup('responsable', groupId)}
                        className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                      >
                        + Responsable
                      </button>
                      {showConductorButtons && (
                        <button
                          onClick={() => addRowToGroup('conductor', groupId)}
                          className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                        >
                          + Conductor
                        </button>
                      )}
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
                      {isCuinaDept && (
                        <button
                          onClick={() => addCenterExternalExtra(groupId)}
                          className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                        >
                          + Extra C.Extern
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {!isLocked && canManageGroups && (
              <div className="px-3 py-3 bg-slate-50 border-b">
                <button
                  onClick={addGroup}
                  className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100"
                >
                  + Grup
                </button>
              </div>
            )}
            {renderDisplayItemsMobile(buildDisplayItems(rows))}
          </>
        ) : (
          renderDisplayItemsMobile(buildDisplayItems(rows))
        )}
      </div>

      {!showStructuredGroups && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 bg-gray-50 border-t">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => addRowToGroup('responsable', defaultGroupId)}
              className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
            >
              + Responsable
            </button>
            {showConductorButtons && (
              <button
                onClick={() => addRowToGroup('conductor', defaultGroupId)}
                className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
              >
                + Conductor
              </button>
            )}
            <button
              onClick={() => addRowToGroup('treballador', defaultGroupId)}
              className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
            >
              + Treballador
            </button>
            <button
              onClick={() => addEttRow(defaultGroupId)}
              className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-200"
            >
              + ETT
            </button>
            {isCuinaDept && (
              <button
                onClick={() => addCenterExternalExtra(defaultGroupId)}
                className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
              >
                + Extra C.Extern
              </button>
            )}
          </div>
        </div>
      )}

      {currentEditingRow && editIdx !== null && (
        <div className="sm:hidden">
          <RowEditor
            row={currentEditingRow}
            available={availableForEditor}
            isServeisDept={isServeisDept}
            allowExternalWorkerName={isCuinaDept && Boolean(currentEditingRow.isExternal)}
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
    </>
  )
}
