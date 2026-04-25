# ADR-004: Governed Firestore Access

## Status
Accepted

## Decision
Use a dual strategy:
- manual collection dictionary for governance (`domain`, `sensitivity`, `owner`, `joinKeys`)
- automatic catalog inference for discovery of new collections

## Rationale
Supports growth (new collections) while preserving governance and security.
