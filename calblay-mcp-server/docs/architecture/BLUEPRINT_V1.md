# MCP Server Blueprint v1

## Objective

Build a robust query/report platform with deterministic data access, semantic routing, and extensibility for future machine learning workloads.

## Architectural Layers

1. Core contracts (`src/core/contracts`)
   - Canonical output schemas (query result, query error).
2. Semantic layer (`src/core/semantics`)
   - Intent detection and domain routing.
3. Policy layer (`src/core/policies`)
   - Data-backed answer policy (no generic answers for data intents).
4. Data adapters (`src/services`)
   - Firestore, finance CSV, SAP connectors.
5. AI orchestration (`src/services/ai-chat*`)
   - Tool selection, tool execution, answer rendering.
6. Governance artifacts (`config`)
   - Canonical dictionary and Firestore collection dictionary.

## Non-negotiable Rules

- Any data intent must use at least one data tool call.
- If no data tool call succeeded, the answer must explicitly say data could not be validated.
- Domain-specific queries must use domain-specific tools when available.
- Generic Firestore tools are fallback, not first choice when a dedicated tool exists.

## Current Execution Status

- Implemented core contract and policy modules.
- Implemented generic Firestore catalog/query architecture.
- Implemented domain dictionary + manual review tracking.
- Implemented domain-specific tools for:
  - food safety (celiac-safe dishes from Firestore `plats`)
  - finance sales by article+centre+month.

## Next Milestone

- Add integration tests for deterministic tool routing and output quality gates.
