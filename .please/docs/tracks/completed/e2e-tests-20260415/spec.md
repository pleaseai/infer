# E2E Test Suite

> Track: e2e-tests-20260415

## Overview

Add an end-to-end test suite that exercises infer-please through its public interfaces (HTTP API and AI SDK provider) with real backend binaries. Unit and integration tests currently mock `spawn`/`fetch`; this track adds a complementary layer that validates the full request path — CLI-started server → Hono routes → TeiManager → real TEI process — catching regressions that mock-based tests cannot detect (binary discovery, actual health probes, port allocation under real load, idle timeout + crash recovery with live processes).

## Scope

**In scope:**

- **HTTP API endpoints** (packages/server): `/v1/models`, `/v1/embeddings`, `/v1/rerank`, `/v1/chat/completions` (501 stub verification) covered via real HTTP requests to a live `infer start` server
- **AI SDK integration** (packages/ai-sdk): `createInferPlease().embed()` and `embedMany()` hitting a real server with real TEI backend
- **TEI process lifecycle** (implicit): spawn on first request, health check readiness, idle timeout shutdown, port pool reclaim — verified through live binary execution rather than direct unit-style assertions

**Out of scope:**

- llama.cpp/chat completion beyond the 501 stub (chat backend not yet implemented)
- CLI argv edge cases (covered by existing unit tests)
- Performance benchmarking or load testing
- Multi-model concurrency stress tests

## Approach

- **Framework**: Bun test runner (existing stack; no new dependencies)
- **Location**: `packages/server/test/e2e/` and `packages/ai-sdk/test/e2e/` — separated from unit/integration tests
- **Binary requirement**: Tests require `text-embeddings-router` on `$PATH`. Tests skip with a clear message if the binary is missing (developer-friendly), but CI must have it installed.
- **Test model**: Use a single small embedding model (e.g., `sentence-transformers/all-MiniLM-L6-v2` or similar) pinned as a test constant for determinism and reasonable cold-start time
- **Server lifecycle**: Each test suite starts the server on an ephemeral port via `buildApp()` + `Bun.serve()`, tears it down in `afterAll`
- **Isolation**: Each suite uses its own port range and its own model, so suites can run in parallel without cross-talk

## Success Criteria

- [ ] SC-1: E2E suite runs green locally via `bun test --test-name-pattern=e2e` (or equivalent filter) when TEI binary is available
- [ ] SC-2: E2E suite runs in CI (GitHub Actions) as a separate job with TEI binary installed
- [ ] SC-3: Suite covers at least: list models, compute embeddings, rerank documents, SDK `embed()` roundtrip, idle-timeout shutdown observed, subsequent request re-spawns successfully
- [ ] SC-4: Suite completes in ≤ 60s on a typical dev machine (Apple Silicon) after model is cached by HuggingFace Hub
- [ ] SC-5: Tests skip (not fail) with an actionable message when the TEI binary is not on `$PATH`

## Constraints

- Must use real `text-embeddings-router` binary — no mocks at the backend boundary
- Must not bundle or install the binary; CI job installs it explicitly
- Must not introduce new test frameworks (Bun test only)
- Must not break existing unit/integration test isolation (separate directories, separate naming)
- Must respect the architectural invariant that route handlers do not know about `Bun.spawn()` — E2E tests validate behavior, not implementation coupling

## Open Questions

- Which specific embedding model to pin for tests? (proposed: `sentence-transformers/all-MiniLM-L6-v2` — small, widely used, ~22MB)
- CI runner capacity: does GitHub Actions standard runner have enough memory/disk for HF model cache? If not, add a self-hosted runner or skip in CI.
