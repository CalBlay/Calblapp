import {
  CorporateFilterField,
  CorporateFilterInput,
  CorporateFilterSearch,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'

type DepartmentOption = {
  value: string
  label: string
}

type Props = {
  departmentOptions: DepartmentOption[]
  departmentFilter: string
  setDepartmentFilter: (value: string) => void
  ownerOptions: string[]
  ownerFilter: string
  setOwnerFilter: (value: string) => void
  lifecycleFilter: 'open' | 'closed' | 'all'
  setLifecycleFilter: (value: 'open' | 'closed' | 'all') => void
  participationScope: 'mine' | 'all'
  setParticipationScope: (value: 'mine' | 'all') => void
  canViewAllProjects: boolean
  startDate: string
  endDate: string
  setStartDate: (value: string) => void
  setEndDate: (value: string) => void
  query: string
  setQuery: (value: string) => void
}

export default function ProjectsFilters({
  departmentOptions,
  departmentFilter,
  setDepartmentFilter,
  ownerOptions,
  ownerFilter,
  setOwnerFilter,
  lifecycleFilter,
  setLifecycleFilter,
  participationScope,
  setParticipationScope,
  canViewAllProjects,
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  query,
  setQuery,
}: Props) {
  return (
    <CorporateFiltersShell>
      <CorporateFilterField label="Vista">
        <CorporateFilterSelect
          minWidthClassName="min-w-[180px]"
          value={participationScope}
          onChange={(event) => setParticipationScope(event.target.value as 'mine' | 'all')}
          disabled={!canViewAllProjects}
        >
          <option value="mine">Els meus projectes</option>
          {canViewAllProjects ? <option value="all">Tots els projectes</option> : null}
        </CorporateFilterSelect>
      </CorporateFilterField>

      <CorporateFilterField label="Departament">
        <CorporateFilterSelect
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
        >
          <option value="__all_departments__">Tots</option>
          {departmentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </CorporateFilterSelect>
      </CorporateFilterField>

      <CorporateFilterField label="Responsable">
        <CorporateFilterSelect
          value={ownerFilter}
          onChange={(event) => setOwnerFilter(event.target.value)}
        >
          <option value="__all_owners__">Tots</option>
          {ownerOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </CorporateFilterSelect>
      </CorporateFilterField>

      <CorporateFilterField label="Estat">
        <CorporateFilterSelect
          value={lifecycleFilter}
          onChange={(event) => setLifecycleFilter(event.target.value as 'open' | 'closed' | 'all')}
        >
          <option value="open">Oberts</option>
          <option value="closed">Tancats</option>
          <option value="all">Tots</option>
        </CorporateFilterSelect>
      </CorporateFilterField>

      <CorporateFilterField label="Des de">
        <CorporateFilterInput
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
      </CorporateFilterField>

      <CorporateFilterField label="Fins a">
        <CorporateFilterInput
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
      </CorporateFilterField>

      <CorporateFilterField label="Cercar projecte" className="min-w-[260px] flex-1">
        <CorporateFilterSearch
          type="text"
          placeholder="Nom, responsable o departament"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </CorporateFilterField>
    </CorporateFiltersShell>
  )
}
