# Pillars & Definition of Done (V1)

## Pillar 1 - Semantic Layer

DoD:
- [ ] Every critical metric has unique `metric_id`.
- [ ] Source-of-truth and calculation rules documented.
- [ ] Alias/typo normalization defined for each metric.
- [ ] Owner assigned (business + technical).

## Pillar 2 - Query Planner

DoD:
- [ ] Planner outputs structured plan for each query.
- [ ] Plan includes metric, slots, and fallback status.
- [ ] Ambiguous queries are flagged explicitly (not hidden).

## Pillar 3 - Deterministic Executors

DoD:
- [ ] Final values are always computed in deterministic code.
- [ ] Executor returns source and calc details.
- [ ] No model-generated numeric final values.

## Pillar 4 - Observability & Replay

DoD:
- [ ] Every answer has trace id.
- [ ] Stored trace contains plan + executor outputs + final answer.
- [ ] Replay endpoint can reconstruct final answer from trace.

## Pillar 5 - Quality Gates

DoD:
- [ ] DoD checks endpoint green.
- [ ] Golden business test suite passes.
- [ ] Release blocked on critical mismatches.

## Pillar 6 - Controlled Learning

DoD:
- [ ] Trace + feedback ingestion active.
- [ ] Dataset export pipeline available.
- [ ] Model/routing changes validated offline before release.

