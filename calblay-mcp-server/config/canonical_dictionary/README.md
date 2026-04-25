# Canonical Dictionary v1.2.1

Runtime dictionary for MCP queries and reports.

This folder is versioned inside `calblay-mcp-server` so the API can resolve
dimensions and center aliases consistently in every environment.

## Files

- `catalog_dimension_1.csv`
- `catalog_dimension_2.csv`
- `catalog_dimension_3.csv`
- `catalog_center_alias.csv`
- `data_quality_issues.csv`

## Load order

1. `catalog_dimension_1.csv`
2. `catalog_dimension_2.csv`
3. `catalog_dimension_3.csv`
4. `catalog_center_alias.csv`

## Resolution rules

1. If `dimension_1_code` arrives, use it.
2. If missing, try line-name synonyms.
3. If a center arrives, resolve with `catalog_center_alias.csv`.
4. If center resolves, inherit `dimension_1_code` from `catalog_dimension_2.csv`.
5. If unresolved, mark `needs_review`.

## Data governance

- `event_code` is the event key (Firestore).
- If a dataset does not include `event_code`, use contextual join:
  `dimension_1` + `dimension_2` + period.
- Persist `source_system` and `confidence` in processing traces.
