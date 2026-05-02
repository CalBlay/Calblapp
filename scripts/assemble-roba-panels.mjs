/**
 * Slices RobaPersonalDashboard monolith into panel modules (adds import headers).
 *
 * Usage:
 *   node scripts/assemble-roba-panels.mjs [path/to/monolith.tsx]
 *
 * If path omitted: uses the first existing file among
 *   RobaPersonalDashboard.monolith.github.tsx
 *   RobaPersonalDashboard.monolith.tsx
 *   RobaPersonalDashboard.tsx
 * Preferring one that contains `function SollicitudsPanel`.
 *
 * Fetch GitHub snapshot (outside Cursor if shell is blocked):
 *   node scripts/fetch-github-roba-dashboard-monolith.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const robaDir = path.join(root, 'src/app/menu/roba-personal')

function fnStartIndex(lines, name) {
  const re = new RegExp(`^(export )?function ${name}\\b`)
  const i = lines.findIndex((l) => re.test(l))
  return i
}

function resolveDashPath() {
  const arg = process.argv[2]
  if (arg) return path.resolve(arg)

  const candidates = [
    path.join(robaDir, 'RobaPersonalDashboard.monolith.github.tsx'),
    path.join(robaDir, 'RobaPersonalDashboard.monolith.tsx'),
    path.join(robaDir, 'RobaPersonalDashboard.tsx'),
  ]

  const withText = candidates.filter((p) => fs.existsSync(p))
  for (const p of withText) {
    const t = fs.readFileSync(p, 'utf8')
    if (fnStartIndex(t.split(/\r?\n/), 'SollicitudsPanel') >= 0) return p
  }
  if (withText.length) return withText[0]
  throw new Error('No dashboard file found')
}

function makeExportFnFirstLine(slice, name) {
  slice[0] = slice[0].replace(
    new RegExp(`^(export )?function\\s+${name}\\b`),
    'export function ' + name
  )
}

const dashPath = resolveDashPath()
const lines = fs.readFileSync(dashPath, 'utf8').split(/\r?\n/)

if (fnStartIndex(lines, 'SollicitudsPanel') < 0) {
  console.error(
    `No SollicitudsPanel in ${dashPath} — need a monolith. Run:\n` +
      `  node scripts/fetch-github-roba-dashboard-monolith.mjs\n` +
      `then:\n` +
      `  node scripts/assemble-roba-panels.mjs src/app/menu/roba-personal/RobaPersonalDashboard.monolith.github.tsx\n` +
      `Or restore your ~4k-line file from git and pass its path.`
  )
  process.exit(1)
}

const solHeader = `'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useSession } from 'next-auth/react'
import { DEPARTMENTS, type DepartmentId } from '@/data/departments'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { normalizeRole } from '@/lib/roles'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import { formatDateOnly, formatDateTimeValue } from '@/lib/date-format'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { ProductRow, RequestRow, WorkerRow } from './robaPersonalTypes'
import { ROBA_REQUEST_STATUS_LABEL, SOLIC_TABLE_COLS } from './robaPersonalConstants'
import { robaRequestCalendarDay, robaSollicitudsWeekRange, formatRobaDayGroupLabel } from './robaPersonalDates'
import { productById } from './robaProductHelpers'

`

const entHeader = `'use client'

import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, Trash2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { DEPARTMENTS } from '@/data/departments'
import { robaRequestDocIdFromInput } from '@/lib/roba-personal/dotacioReferenceCodes'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { normalizeRole } from '@/lib/roles'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { DeliveryRow, ProductRow, RequestRow, WorkerRow } from './robaPersonalTypes'
import {
  ENTREGUES_TABLE_COLS_LEAD,
  ENTREGUES_TABLE_COLS_WORKER,
  parseRobaTab,
} from './robaPersonalConstants'
import { robaRequestCalendarDay, robaSollicitudsWeekRange, formatRobaDayGroupLabel } from './robaPersonalDates'
import { productById } from './robaProductHelpers'
import {
  deliveryReceptionFilterKey,
  entregaDeliveredTotalUnits,
  entregaEstatLabelForLead,
  entregaRequestedTotalUnits,
} from './robaDeliveryHelpers'
import { RobaEntregaProducteColumn } from './RobaEntregaProducteColumn'
import { RobaSignaturePad } from './RobaSignaturePad'
import {
  WorkerDeliveryAwaitingCorrectionCard,
  WorkerLeadDeliveryAckCard,
  WorkerReceiptConfirmationCard,
} from './EntreguesWorkerCards'

`

const trebHeader = `'use client'

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Paperclip, Search } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { ROBA_PRODUCT_DEPARTMENTS, type RobaProductDepartmentId } from '@/data/departments'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { buildWorkerCodeFromName } from '@/lib/roba-personal/workerCodeFormat'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { WorkerRow } from './robaPersonalTypes'
import { foldTreballadorCerca } from './robaWorkerSearch'

`

const estocHeader = `'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { taulaContentidorScroll, taulaThText } from '@/lib/taules'
import { cn } from '@/lib/utils'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { DEFAULT_DOTACIO_MAGATZEM } from '@/lib/roba-personal/dotacioDefaults'
import { exportRowsToPdf, exportRowsToXlsx, robaExportFilename } from '@/lib/roba-personal/robaExport'
import { useRegisterModuleExportMenu } from '@/components/export/ModuleExportMenuContext'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { ProductRow, StockOverviewRow } from './robaPersonalTypes'

`

const compHeader = `'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductSearchCombobox } from './ProductSearchCombobox'
import { robaPersonalApi as api } from './robaPersonalApi'
import type { ProductRow } from './robaPersonalTypes'

`

// --- TreballadorsPanel
{
  const a = fnStartIndex(lines, 'TreballadorsPanel')
  const b = fnStartIndex(lines, 'EstocPanel')
  if (a < 0 || b < 0 || b <= a) throw new Error('TreballadorsPanel / EstocPanel boundaries not found')
  const trebSlice = lines.slice(a, b)
  makeExportFnFirstLine(trebSlice, 'TreballadorsPanel')
  fs.writeFileSync(path.join(robaDir, 'TreballadorsPanel.tsx'), trebHeader + trebSlice.join('\n') + '\n', 'utf8')
}

// --- EstocPanel (+ optional formatDaysUntilMin directly above)
{
  const estocFn = fnStartIndex(lines, 'EstocPanel')
  const solicFn = fnStartIndex(lines, 'SollicitudsPanel')
  if (estocFn < 0 || solicFn < 0 || solicFn <= estocFn)
    throw new Error('EstocPanel / SollicitudsPanel boundaries not found')
  let estocStart = estocFn
  for (let i = estocFn - 1; i >= 0 && i >= estocFn - 40; i--) {
    if (/^function formatDaysUntilMin\b/.test(lines[i])) {
      estocStart = i
      break
    }
  }
  const estocSlice = lines.slice(estocStart, solicFn)
  const exportIdx = estocFn - estocStart
  estocSlice[exportIdx] = estocSlice[exportIdx].replace(
    /^(export )?function\s+EstocPanel\b/,
    'export function EstocPanel'
  )
  fs.writeFileSync(path.join(robaDir, 'EstocPanel.tsx'), estocHeader + estocSlice.join('\n') + '\n', 'utf8')
}

// --- SollicitudsPanel
{
  const a = fnStartIndex(lines, 'SollicitudsPanel')
  if (a < 0) throw new Error('SollicitudsPanel not found')
  let b = lines.length
  const typeDel = lines.findIndex((l, idx) => idx > a && /^type DeliveryRow\b/.test(l))
  const entFn = lines.findIndex((l, idx) => idx > a && /^(export )?function EntreguesPanel\b/.test(l))
  if (typeDel >= 0) b = Math.min(b, typeDel)
  if (entFn >= 0) b = Math.min(b, entFn)
  if (b <= a) throw new Error('SollicitudsPanel end boundary not found')
  const solSlice = lines.slice(a, b)
  makeExportFnFirstLine(solSlice, 'SollicitudsPanel')
  fs.writeFileSync(path.join(robaDir, 'SollicitudsPanel.tsx'), solHeader + solSlice.join('\n') + '\n', 'utf8')
}

// --- EntreguesPanel
{
  const a = fnStartIndex(lines, 'EntreguesPanel')
  const b = fnStartIndex(lines, 'CompresPanel')
  if (a < 0 || b < 0 || b <= a) throw new Error('EntreguesPanel / CompresPanel boundaries not found')
  const entSlice = lines.slice(a, b)
  makeExportFnFirstLine(entSlice, 'EntreguesPanel')
  fs.writeFileSync(path.join(robaDir, 'EntreguesPanel.tsx'), entHeader + entSlice.join('\n') + '\n', 'utf8')
}

// --- CompresPanel
{
  const a = fnStartIndex(lines, 'CompresPanel')
  if (a < 0) throw new Error('CompresPanel not found')
  const compSlice = lines.slice(a)
  makeExportFnFirstLine(compSlice, 'CompresPanel')
  fs.writeFileSync(path.join(robaDir, 'CompresPanel.tsx'), compHeader + compSlice.join('\n') + '\n', 'utf8')
}

console.log('Source:', dashPath)
console.log('assembled SollicitudsPanel, EntreguesPanel, TreballadorsPanel, EstocPanel, CompresPanel')
