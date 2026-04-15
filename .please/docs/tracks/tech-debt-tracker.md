# Tech Debt Tracker

> Tracked across all tracks. Updated during implementation and retrospectives.

## Active

| ID | Source Track | Description | Priority | Created |
|----|------------|-------------|----------|---------|
| TD-001 | e2e-tests-20260415 | `createInferPlease` factory cannot accept a preconfigured `TeiManager`; E2E works around this by constructing `InferPleaseEmbeddingModel` directly. Expose an optional `manager` parameter. | Low | 2026-04-15 |
| TD-002 | e2e-tests-20260415 | TEI image pinned to floating `cpu-latest` tag — reproducibility gap when debugging stale CI runs. Consider pinning to a digest with documented rotation policy. | Low | 2026-04-15 |
| TD-003 | docker-runtime-gpu-detect-20260415 | `Bun.spawn` return shape cast through `unknown` to match `SubprocessLike` (runtime-selector.ts:43-44). Brittle if Bun API changes. Tighten types via `@types/bun` alignment. | Low | 2026-04-15 |
| TD-004 | docker-runtime-gpu-detect-20260415 | E2E `_hfCacheHost` probe is declared-only (`defaultHfCacheHost()` has no throw path). Dead sanity code — remove or replace with actual validation. | Low | 2026-04-15 |
| TD-005 | docker-runtime-gpu-detect-20260415 | FR-10 spec wording mandates `console.warn` for experimental variants, implementation emits via stdout banner logLine. Decide whether to add a proper `console.warn` call or update spec wording. | Low | 2026-04-15 |
| TD-006 | docker-runtime-gpu-detect-20260415 | T016 (E2E Docker regression run) deferred to manual verification. Integrate into CI lane with Docker-enabled runner. | Medium | 2026-04-15 |

## Resolved

| ID | Source Track | Description | Resolved In | Date |
|----|------------|-------------|-------------|------|
