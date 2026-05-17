'use client'

import ExportMenu from '@/components/export/ExportMenu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FormState, PlatLookupItem } from '../types'

type Props = {
  form: FormState
  loading: boolean
  translating: boolean
  searchQuery: string
  searchResults: PlatLookupItem[]
  activeSearchField: 'code' | 'nameCa' | null
  pendingImportMode: 'replace' | 'incremental' | null
  importFileRef: React.RefObject<HTMLInputElement>
  onAutoTranslate: () => void | Promise<void>
  onExportPdf: () => void | Promise<void>
  onExportXlsx: () => void | Promise<void>
  onOpenManualImport: (mode: 'replace' | 'incremental') => void
  onImportFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onFieldFocus: (field: 'code' | 'nameCa') => void
  onCodeChange: (value: string) => void
  onNameCaChange: (value: string) => void
  onCodeEnter: () => void | Promise<void>
  onNameEnter: () => void | Promise<void>
  onSearchSelect: (item: PlatLookupItem) => void | Promise<void>
  onNameChange: (field: 'nameEs' | 'nameEn', value: string) => void
}

const metaHint = (meta?: { auto?: boolean; reviewed?: boolean }) => {
  if (meta?.reviewed) {
    return <p className="mt-1 text-xs text-emerald-600">Revisat</p>
  }
  if (meta?.auto) {
    return <p className="mt-1 text-xs text-amber-600">Autogenerat</p>
  }
  return null
}

function SearchResults({
  results,
  onSearchSelect,
}: {
  results: PlatLookupItem[]
  onSearchSelect: (item: PlatLookupItem) => void | Promise<void>
}) {
  return (
    <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white">
      {results.map(item => {
        const displayName = item.nameCa || item.nameEs || item.nameEn || ''
        return (
          <button
            key={item.id}
            type="button"
            className="w-full border-b px-3 py-2 text-left text-sm hover:bg-amber-50 last:border-b-0"
            onClick={() => void onSearchSelect(item)}
          >
            <span className="font-medium text-slate-800">{item.code}</span>
            {displayName ? <span className="text-slate-600"> - {displayName}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function BasicDataPanel({
  form,
  loading,
  translating,
  searchQuery,
  searchResults,
  activeSearchField,
  importFileRef,
  onAutoTranslate,
  onExportPdf,
  onExportXlsx,
  onOpenManualImport,
  onImportFileChange,
  onFieldFocus,
  onCodeChange,
  onNameCaChange,
  onCodeEnter,
  onNameEnter,
  onSearchSelect,
  onNameChange,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Dades basiques</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportMenu
            ariaLabel="Exportar base d'allergens"
            items={[
              { label: 'Exportar PDF', onClick: onExportPdf, disabled: loading },
              { label: 'Exportar XLSX', onClick: onExportXlsx, disabled: loading },
            ]}
          />
          <Button
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={() => onOpenManualImport('incremental')}
            disabled={loading}
          >
            Importar
          </Button>
          <Button
            variant="outline"
            className="h-8 px-3 text-xs"
            onClick={() => onOpenManualImport('replace')}
            disabled={loading}
          >
            Reemplaçar
          </Button>
          <Button
            variant="secondary"
            className="h-8 px-3"
            onClick={() => void onAutoTranslate()}
            disabled={loading || translating || !form.nameCa.trim()}
          >
            Autotraduir
          </Button>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onImportFileChange}
          />
        </div>
      </div>

      <p className="mb-4 text-xs text-slate-500">
        Importar afegeix o revisa codis existents. Reemplaçar elimina la base actual i
        carrega el contingut de l&apos;Excel.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Codi *</label>
          <Input
            className="mt-1"
            value={form.code}
            onFocus={() => onFieldFocus('code')}
            onChange={e => onCodeChange(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              void onCodeEnter()
            }}
            placeholder="Ex: C0530100001"
          />

          {activeSearchField === 'code' &&
            searchQuery.trim().length >= 2 &&
            searchResults.length > 0 && (
              <SearchResults results={searchResults} onSearchSelect={onSearchSelect} />
            )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Nom (CAT) *</label>
          <Input
            className="mt-1"
            value={form.nameCa}
            onFocus={() => onFieldFocus('nameCa')}
            onChange={e => onNameCaChange(e.target.value)}
            onKeyDown={e => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              void onNameEnter()
            }}
            placeholder="Nom del plat en catala"
          />

          {activeSearchField === 'nameCa' &&
            searchQuery.trim().length >= 2 &&
            searchResults.length > 0 && (
              <SearchResults results={searchResults} onSearchSelect={onSearchSelect} />
            )}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Nom (ESP)</label>
          <Input
            className="mt-1"
            value={form.nameEs}
            onChange={e => onNameChange('nameEs', e.target.value)}
            placeholder="Nom del plat en castella"
          />
          {metaHint(form.nameMeta.es)}
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Nom (ENG)</label>
          <Input
            className="mt-1"
            value={form.nameEn}
            onChange={e => onNameChange('nameEn', e.target.value)}
            placeholder="Nom del plat en angles"
          />
          {metaHint(form.nameMeta.en)}
        </div>
      </div>
    </div>
  )
}
