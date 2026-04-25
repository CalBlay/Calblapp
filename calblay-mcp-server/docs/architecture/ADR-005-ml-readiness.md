# ADR-005: ML Readiness by Design

## Status
Accepted

## Decision
Track ML metadata in collection dictionary:
- `mlReady`
- `mlFeatures`
- `mlLabelCandidates`

## Rationale
Allows incremental ML adoption (classification, anomaly detection, forecasting) without redesigning query/report layers.
