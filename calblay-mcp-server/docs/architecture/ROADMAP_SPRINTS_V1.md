# Roadmap V1 (Sprints)

## Sprint 0 - Stabilization Baseline

Goal: freeze scope and establish reliable baseline.

- [ ] Freeze new ad-hoc question patches (except blockers).
- [ ] Enable full trace capture by default.
- [ ] Publish current DoD and quality endpoints as "required checks".
- [ ] Define severity policy for wrong business values (P0/P1).

Exit criteria:
- all production responses carry `traceId`,
- DoD endpoint green on baseline.

---

## Sprint 1 - Semantic Layer V1

Goal: catalog top business metrics (20-30).

- [x] Create `config/metric_catalog.json` schema.
- [ ] Add metrics for:
  - costs (subministraments, serveis professionals, assegurances, etc.),
  - maintenance planned/completed,
  - personnel by department,
  - vehicle assignments,
  - worker services count.
- [ ] Add canonical alias table per metric (`synonyms`, `typos`, `labels`).

Exit criteria:
- at least 20 metrics cataloged with source and calc rule.

---

## Sprint 2 - Query Planner V1

Goal: compile question -> plan deterministically.

- [x] Implement planner module:
  - intent detection,
  - slot extraction,
  - metric resolution.
- [x] Emit structured plan (`query_plan`) in traces.
- [x] Add fallback policy states: `catalog_hit`, `catalog_miss`, `ambiguous`.
- [x] Add planner observability (`toolChoiceSource`) and rollout stats endpoint.

Exit criteria:
- planner resolves >= 80% of golden set into catalog metrics.
- rollout observability available (`/chat/learning/tool-choice-stats`, quality alert in `quality:report`).

Sprint status: CLOSED (V1 baseline + observability completed).

---

## Sprint 3 - Deterministic Executors

Goal: deterministic execution for catalog metrics.

- [x] Implement executor interface and adapters (Firestore/CSV) - baseline (`deterministic-executor.service` + `/tools/executor/run`).
- [x] Move catalog metrics off ad-hoc tool orchestration (strict catalog executor mode blocks auto fallback).
- [x] Return structured `calc_details` (row/column/aggregation) in deterministic path (`/chat` + executor output).

Exit criteria:
- top critical metrics have deterministic executor path.

---

## Sprint 4 - Golden Business Test Suite

Goal: block regressions in business answers.

- [x] Create and expand golden dataset + executable runner (`config/golden_business_cases.json`, `npm run quality:golden`).
- [x] Expand golden dataset to 30 queries with expected value/source (V1 baseline).
- [x] Add CI gate: fail release on critical mismatch (`npm run quality:ci`).
- [x] Add drift check for last N traces vs golden behavior (`npm run quality:drift`, `quality:report` alert).

Exit criteria:
- CI blocks incorrect business answers before deploy.

Sprint status: CLOSED (V1 baseline completed: golden + CI gate + drift guard).

---

## Sprint 5 - Controlled Learning

Goal: use feedback safely to improve parser/routing.

- [ ] Build ETL for traces + feedback -> training dataset.
- [ ] Add offline evaluation for intent/slot models.
- [ ] Add "suggested catalog updates" report (no auto-merge).

Exit criteria:
- monthly measurable gain in routing accuracy, zero critical value regressions.

