# ADR-002: Canonical Query Contract

## Status
Accepted

## Decision
All query outputs must use a canonical envelope with:
- `domain`
- `source_system`
- `join_rule`
- `confidence`
- `rows`
- `data_quality_flags`

## Rationale
Makes tool outputs composable and reliable for report generation, QA, and ML feature extraction.
