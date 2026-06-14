'use client'

import * as React from 'react'
import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { MODULES, type AccessUser } from '@/lib/accessControl'
import { buildEffectiveBaseMap, baseForPath } from '@/lib/permissions/effectiveBase'
import {
  PERMISSION_ACTION_GROUPS,
  actionGroupDefaultExpanded,
  buildMatrixRows,
  shouldShowActionGroup,
} from '@/lib/permissions/matrixConfig'
import {
  applyOverrideEffects,
  effectiveAllowed,
  getClientOverrideEffect,
} from '@/lib/permissions/overrideState'
import type { AssignmentOverride } from '@/lib/permissions/types'
import { CALENDAR_EDIT_IMPLIED_ACTIONS, PERM } from '@/lib/permissionKeys'

function PermissionActionGroupCard({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left rounded-lg -m-1 p-1 hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <h2 className="font-semibold flex-1 text-sm">{title}</h2>
      </button>
      {expanded && (
        <>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          {children}
        </>
      )}
    </div>
  )
}

type Props = {
  accessUser: AccessUser
  overrides: AssignmentOverride[]
  onOverridesChange: React.Dispatch<React.SetStateAction<AssignmentOverride[]>>
  compact?: boolean
  intro?: string
}

export function UserPermissionsEditor({
  accessUser,
  overrides,
  onOverridesChange,
  compact = false,
  intro,
}: Props) {
  const rows = useMemo(() => buildMatrixRows(), [])
  const baseMap = useMemo(() => buildEffectiveBaseMap(accessUser), [accessUser])
  const [actionGroupExpandedManual, setActionGroupExpandedManual] = useState<
    Record<string, boolean>
  >({})

  const setOverrideEffects = (
    updates: Array<{ permission: string; effect: 'allow' | 'deny' | null }>
  ) => {
    onOverridesChange((prev) => applyOverrideEffects(prev, updates))
  }

  const baseFor = (path: string) => baseForPath(baseMap, path)

  const matrixMaxHeight = compact ? 'max-h-[40vh]' : 'max-h-[55vh]'

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {intro ??
          'Marcat = permès. Per defecte segons nivell i departament. Els canvis es guarden com overrides per usuari.'}
      </p>

      <div className={`rounded-xl border border-border overflow-hidden ${matrixMaxHeight} overflow-y-auto`}>
        <div className="grid grid-cols-12 bg-muted/40 px-3 py-2 text-xs font-semibold sticky top-0 z-10">
          <div className="col-span-6">Mòdul</div>
          <div className="col-span-3">Visualització</div>
          <div className="col-span-3">Edició</div>
        </div>
        <div className="divide-y">
          {rows.map((r) => {
            const base = baseFor(r.path)
            const viewChecked = effectiveAllowed(overrides, PERM.view(r.path), base.view)
            const editChecked = effectiveAllowed(overrides, PERM.edit(r.path), base.edit)

            const label =
              r.level === 'submodule' ? (
                <span className="pl-4">↳ {r.label}</span>
              ) : (
                <span className="font-medium">{r.label}</span>
              )

            return (
              <div key={r.key} className="grid grid-cols-12 px-3 py-2 text-sm items-center">
                <div className="col-span-6 truncate">{label}</div>

                <div className="col-span-3">
                  <input
                    type="checkbox"
                    checked={viewChecked}
                    onChange={(e) => {
                      const desired = e.target.checked
                      const updates: Array<{ permission: string; effect: 'allow' | 'deny' | null }> =
                        [
                          {
                            permission: PERM.view(r.path),
                            effect: desired === base.view ? null : desired ? 'allow' : 'deny',
                          },
                        ]
                      if (!desired) {
                        updates.push({ permission: PERM.edit(r.path), effect: null })
                        if (r.level === 'module') {
                          const mod = MODULES.find((m) => m.path === r.path)
                          for (const sub of mod?.submodules || []) {
                            const subBase = baseFor(sub.path)
                            updates.push({
                              permission: PERM.view(sub.path),
                              effect: subBase.view ? 'deny' : null,
                            })
                            updates.push({ permission: PERM.edit(sub.path), effect: null })
                          }
                        }
                      }
                      setOverrideEffects(updates)
                    }}
                  />
                </div>

                <div className="col-span-3">
                  <input
                    type="checkbox"
                    checked={editChecked}
                    onChange={(e) => {
                      const desired = e.target.checked
                      const updates: Array<{ permission: string; effect: 'allow' | 'deny' | null }> =
                        [
                          {
                            permission: PERM.edit(r.path),
                            effect: desired === base.edit ? null : desired ? 'allow' : 'deny',
                          },
                        ]
                      if (desired) {
                        updates.push({
                          permission: PERM.view(r.path),
                          effect: base.view ? null : 'allow',
                        })
                        if (r.path === '/menu/calendar') {
                          for (const action of CALENDAR_EDIT_IMPLIED_ACTIONS) {
                            updates.push({
                              permission: PERM.action('/menu/calendar', action),
                              effect: 'allow',
                            })
                          }
                        }
                      } else if (r.path === '/menu/calendar') {
                        for (const action of CALENDAR_EDIT_IMPLIED_ACTIONS) {
                          updates.push({
                            permission: PERM.action('/menu/calendar', action),
                            effect: null,
                          })
                        }
                      }
                      setOverrideEffects(updates)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {PERMISSION_ACTION_GROUPS.map((group) => {
        const p = group.visibleWhen.path
        const base = baseFor(p)
        const viewAllowed = effectiveAllowed(overrides, PERM.view(p), base.view)
        const editAllowed = effectiveAllowed(overrides, PERM.edit(p), base.edit)

        if (!shouldShowActionGroup(viewAllowed, editAllowed, group.requireViewOnly)) return null

        const defaultExpanded = actionGroupDefaultExpanded(
          viewAllowed,
          editAllowed,
          group.requireViewOnly
        )
        const expanded = actionGroupExpandedManual[group.id] ?? defaultExpanded

        return (
          <PermissionActionGroupCard
            key={group.id}
            title={group.title}
            subtitle={group.subtitle}
            expanded={expanded}
            onToggle={() =>
              setActionGroupExpandedManual((prev) => ({
                ...prev,
                [group.id]: !expanded,
              }))
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {group.actions.map((a) => {
                const checked = getClientOverrideEffect(overrides, a.key) === 'allow'
                return (
                  <label
                    key={a.key}
                    className="flex items-center gap-2 rounded-lg border border-border p-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setOverrideEffects([
                          { permission: a.key, effect: e.target.checked ? 'allow' : 'deny' },
                        ])
                      }
                    />
                    <span className="text-sm">{a.label}</span>
                  </label>
                )
              })}
            </div>
          </PermissionActionGroupCard>
        )
      })}
    </div>
  )
}
