# Plan: E2E Test Suite

> Track: e2e-tests-20260415
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: e2e-tests-20260415
- **Issue**: (pending)
- **Created**: 2026-04-15
- **Approach**: Separate `test/e2e/` directories per package, shared helpers, real `Bun.serve()` + real TEI binary, new CI job with binary install

## Purpose

Validate the full request path (HTTP → Hono routes → TeiManager → real TEI process) through the public interfaces, catching regressions that the existing mock-based tests cannot detect — binary discovery, actual health probes, port allocation, and idle-timeout behavior under live processes.

## Context

All existing tests are colocated in `src/*.test.ts` and use mocked `spawn`/`fetch`. `packages/server/src/integration.test.ts` uses `buildApp()` with mock backends via `app.fetch()`, never opening a real port. E2E tests break from this convention by (a) living in a separate `test/e2e/` directory per package, (b) calling `Bun.serve()` on an ephemeral port, and (c) requiring `text-embeddings-router` on `$PATH` at runtime.

## Architecture Decision

**Directory separation over colocation**: E2E tests have different runtime requirements (real binary, real network) than unit tests. Colocating them in `src/` would cause the default `bun test` to require a TEI binary, breaking dev ergonomics. Separating via `test/e2e/` lets the default `bun test` stay binary-free while `bun test test/e2e` (or a turbo `test:e2e` task) runs the E2E suite explicitly.

**Real port over `app.fetch()`**: The existing `integration.test.ts` uses `app.fetch()` to exercise Hono routes without opening a port. That correctly tests route wiring but cannot catch issues like port conflicts with spawned backends, middleware ordering under real connections, or streaming behavior. E2E uses `Bun.serve({ port: 0 })` for a random ephemeral port.

**Skip-not-fail when binary missing**: Local dev without TEI installed should see tests skip with an actionable message, not fail. CI always has the binary — if missing there, that's a workflow bug and must fail. Differentiation via `process.env.CI === 'true'`.

**One shared model, one worker**: Tests pin a single embedding model and run sequentially within the E2E suite (no parallel workers). TEI is one-process-per-model, and running multiple suites concurrently would duplicate model downloads and blow out CI time. Parallelism between unrelated suites is still fine via separate ports.

## Architecture Diagram

```
E2E Test Suite
├─ packages/server/test/e2e/
│  ├─ helpers.ts          # startTestServer(), skipIfNoTei()
│  ├─ models.e2e.test.ts  # GET /v1/models
│  ├─ embeddings.e2e.test.ts  # POST /v1/embeddings (spawns TEI)
│  ├─ rerank.e2e.test.ts
│  ├─ chat.e2e.test.ts    # 501 stub
│  └─ lifecycle.e2e.test.ts  # idle timeout + respawn
└─ packages/ai-sdk/test/e2e/
   ├─ helpers.ts          # re-use server helpers
   └─ provider.e2e.test.ts  # embed(), embedMany()

Flow (per test):
  beforeAll: Bun.which('text-embeddings-router') → skip if null
             buildApp() + Bun.serve({ port: 0 }) → get real URL
  test:     fetch(url) or SDK call → real HTTP → server → TeiManager → spawn real TEI
  afterAll: server.stop() + teiManager.shutdown()
```

## Tasks

- [ ] T001 Create E2E helpers with `startTestServer()` and `skipIfNoTei()` utilities (file: packages/server/test/e2e/helpers.ts)
- [ ] T002 Add `test:e2e` task to turbo.json with `cache: false` and `dependsOn: ["^build"]` (file: turbo.json)
- [ ] T003 Add `test:e2e` npm script to server and ai-sdk packages (files: packages/server/package.json, packages/ai-sdk/package.json)
- [ ] T004 [P] E2E: `/v1/models` list and retrieve returns configured models (file: packages/server/test/e2e/models.e2e.test.ts) (depends on T001)
- [ ] T005 [P] E2E: `/v1/embeddings` produces real embeddings via spawned TEI (file: packages/server/test/e2e/embeddings.e2e.test.ts) (depends on T001)
- [ ] T006 [P] E2E: `/v1/rerank` returns sorted `relevance_score` results (file: packages/server/test/e2e/rerank.e2e.test.ts) (depends on T001)
- [ ] T007 [P] E2E: `/v1/chat/completions` returns 501 with OpenAI-format error (file: packages/server/test/e2e/chat.e2e.test.ts) (depends on T001)
- [ ] T008 [P] E2E: AI SDK `embed()` and `embedMany()` roundtrip via real server (file: packages/ai-sdk/test/e2e/provider.e2e.test.ts) (depends on T001)
- [ ] T009 E2E: TEI idle-timeout shutdown observed, next request re-spawns successfully (file: packages/server/test/e2e/lifecycle.e2e.test.ts) (depends on T001, T005)
- [ ] T010 Add `test:e2e` CI job to `.github/workflows/ci.yml` that installs `text-embeddings-router` via Homebrew and caches HF model downloads (file: .github/workflows/ci.yml) (depends on T003, T009)
- [ ] T011 Document how to run E2E locally (binary install + model cache) in README (file: README.md) (depends on T010)

## Dependencies

```
T001 (helpers) ─┬─→ T004 [P]
                ├─→ T005 [P] ─────┬─→ T009 (lifecycle)
                ├─→ T006 [P]            │
                ├─→ T007 [P]            │
                └─→ T008 [P]            │
T002, T003 ────────────────────┬─→ T010 ─→ T011
                                       │
                            (T009 also precedes T010)
```

## Key Files

- `packages/server/src/app.ts` — exports `buildApp()`, used by E2E helpers
- `packages/server/src/cli.ts` — reference for how the real CLI wires backends (E2E mirrors this)
- `packages/tei/src/binary.ts` — `findTeiBinary()` uses `Bun.which`; E2E uses the same check to decide skip
- `packages/tei/src/tei-manager.ts` — `createTeiManager({ idleTimeout })` — E2E lifecycle test configures a short idle timeout
- `packages/ai-sdk/src/index.ts` — `createInferPlease()` provider factory used in T008
- `.github/workflows/ci.yml` — current CI; T010 adds the E2E job
- `turbo.json` — current pipeline; T002 adds `test:e2e`

## Verification

- Local: `turbo run test:e2e` completes green in ≤ 60s (after first-run model cache warm-up)
- Local without binary: `turbo run test:e2e` reports "skipped" with hint `brew install huggingface/tap/text-embeddings-router`
- CI: new job passes; HF model cache hit on subsequent runs (cache key = model ID)
- Each new test file asserts behavior, not implementation — no references to `spawn` or internal TeiManager state

## Progress

(to be updated by /please:implement)

## Decision Log

- 2026-04-15: Chose `test/e2e/` directory separation over colocated `*.e2e.test.ts` to keep default `bun test` binary-free.
- 2026-04-15: Chose real `Bun.serve()` over `app.fetch()` to cover middleware ordering and port allocation under live connections.

## Surprises & Discoveries

(to be updated during implementation)
