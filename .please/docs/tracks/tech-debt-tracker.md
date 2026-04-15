# Tech Debt Tracker

> Tracked across all tracks. Updated during implementation and retrospectives.

## Active

| ID | Source Track | Description | Priority | Created |
|----|------------|-------------|----------|---------|
| TD-001 | e2e-tests-20260415 | `createInferPlease` factory cannot accept a preconfigured `TeiManager`; E2E works around this by constructing `InferPleaseEmbeddingModel` directly. Expose an optional `manager` parameter. | Low | 2026-04-15 |
| TD-002 | e2e-tests-20260415 | TEI image pinned to floating `cpu-latest` tag — reproducibility gap when debugging stale CI runs. Consider pinning to a digest with documented rotation policy. | Low | 2026-04-15 |

## Resolved

| ID | Source Track | Description | Resolved In | Date |
|----|------------|-------------|-------------|------|
