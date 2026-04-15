# Plan: E2E Test Suite

> Track: e2e-tests-20260415
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: e2e-tests-20260415
- **Issue**: (pending)
- **Created**: 2026-04-15
- **Approach**: Separate `test/e2e/` directories per package, shared helpers, real `Bun.serve()` + real TEI running in Docker via injected `spawnFn` adapter, new CI job using Docker (no binary install)

## Purpose

Validate the full request path (HTTP → Hono routes → TeiManager → real TEI process) through the public interfaces, catching regressions that the existing mock-based tests cannot detect — binary discovery, actual health probes, port allocation, and idle-timeout behavior under live processes.

## Context

All existing tests are colocated in `src/*.test.ts` and use mocked `spawn`/`fetch`. `packages/server/src/integration.test.ts` uses `buildApp()` with mock backends via `app.fetch()`, never opening a real port. E2E tests break from this convention by (a) living in a separate `test/e2e/` directory per package, (b) calling `Bun.serve()` on an ephemeral port, and (c) running real TEI via Docker. The `text-embeddings-router` binary is not distributed via a stable Homebrew formula, so Docker is used instead — `TeiManager` already supports injecting `spawnFn` and `findBinary`, making a Docker adapter a clean substitution that preserves the real lifecycle.

## Architecture Decision

**Directory separation over colocation**: E2E tests have different runtime requirements (Docker, real network) than unit tests. Colocating them in `src/` would cause the default `bun test` to require Docker, breaking dev ergonomics. Separating via `test/e2e/` lets the default `bun test` stay Docker-free while a turbo `test:e2e` task runs the E2E suite explicitly.

**Real port over `app.fetch()`**: The existing `integration.test.ts` uses `app.fetch()` to exercise Hono routes without opening a port. That correctly tests route wiring but cannot catch issues like port conflicts with spawned backends, middleware ordering under real connections, or streaming behavior. E2E uses `Bun.serve({ port: 0 })` for a random ephemeral port.

**Docker via injected `spawnFn` over native binary**: `TeiManager` already accepts an injectable `spawnFn` and `findBinary` (tei-manager.ts:44-49). E2E tests inject a Docker adapter: `findBinary` returns `"docker"`; `spawnFn` parses `--port` / `--model-id` from args, runs `docker run -d --rm -p $PORT:80 -v $HF_CACHE:/data ghcr.io/huggingface/text-embeddings-inference:cpu-latest --model-id X --port 80`, and returns a `SubprocessLike` whose `kill()` runs `docker stop` and whose `exited` promise resolves when the container exits. This preserves the full TeiManager lifecycle — spawn, health-check polling at `http://localhost:$PORT/health`, idle timeout, kill, re-spawn, crash recovery — while avoiding the brittle native binary install path. The native-binary code path remains unchanged and covered by the existing unit tests.

**Skip-not-fail when Docker missing**: Local dev without Docker running should see tests skip with an actionable message, not fail. CI always has Docker — if missing there, that's a workflow bug and must fail. Differentiation via `process.env.CI === 'true'`. Detection via `Bun.which('docker')` + attempting `docker info`.

**One shared small model, one worker**: Tests pin `sentence-transformers/all-MiniLM-L6-v2` (~22MB) and run sequentially within the E2E suite. HF model cache is mounted as a Docker volume so repeated runs reuse downloads.

## Architecture Diagram

```
E2E Test Suite
├─ packages/server/test/e2e/
│  ├─ docker-spawn.ts     # dockerSpawnFn, dockerFindBinary adapters
│  ├─ helpers.ts          # startTestServer(), skipIfNoDocker()
│  ├─ models.e2e.test.ts  # GET /v1/models
│  ├─ embeddings.e2e.test.ts  # POST /v1/embeddings (spawns TEI container)
│  ├─ rerank.e2e.test.ts
│  ├─ chat.e2e.test.ts    # 501 stub
│  └─ lifecycle.e2e.test.ts  # idle timeout + respawn
└─ packages/ai-sdk/test/e2e/
   └─ provider.e2e.test.ts  # embed(), embedMany()

Flow (per suite):
  beforeAll: skipIfNoDocker() → skip if docker missing
             new TeiManager({ portRangeStart, idleTimeoutMs }, dockerSpawnFn, fetch, dockerFindBinary)
             buildApp() + Bun.serve({ port: 0 }) → get server URL
  test:     fetch(url) or SDK call
              → real HTTP → Hono server
              → TeiManager.ensureRunning(model)
              → docker run -d --rm -p $PORT:80 ghcr.io/.../tei --model-id X --port 80
              → wait for http://localhost:$PORT/health
              → TeiClient POSTs to http://localhost:$PORT/embed (TEI native API)
              → response proxied back as OpenAI format
  afterAll: server.stop() + teiManager.stopAll() → docker stop
```

## Tasks

- [x] T001 Create Docker adapter (`dockerSpawnFn`, `dockerFindBinary`) + E2E helpers (`startTestServer()`, `computeSkipReason()`) + smoke test (files: packages/server/test/e2e/docker-spawn.ts, packages/server/test/e2e/helpers.ts, packages/server/test/e2e/smoke.e2e.test.ts)
- [x] T002 Add `test:e2e` task to turbo.json with `cache: false` and `env: [RUN_E2E, CI, HF_HOME]` (file: turbo.json)
- [x] T003 Add `test:e2e` npm script to server, ai-sdk, and root packages; scope default `test` to `src/` so E2E is opt-in (files: packages/server/package.json, packages/ai-sdk/package.json, package.json)
- [x] T004 [P] E2E: `/v1/models` list and retrieve returns configured models (file: packages/server/test/e2e/models.e2e.test.ts)
- [x] T005 [P] E2E: `/v1/embeddings` produces real 384-dim embeddings via Docker TEI (file: packages/server/test/e2e/embeddings.e2e.test.ts)
- [x] T006 [P] E2E: `/v1/rerank` returns sorted `relevance_score` results (file: packages/server/test/e2e/rerank.e2e.test.ts)
- [x] T007 [P] E2E: `/v1/chat/completions` returns 501 with OpenAI-format error (file: packages/server/test/e2e/chat.e2e.test.ts)
- [x] T008 [P] E2E: AI SDK `InferPleaseEmbeddingModel` with Docker-backed TeiManager (file: packages/ai-sdk/test/e2e/provider.e2e.test.ts)
- [x] T009 E2E: Idle-timeout shutdown observed; next request respawns successfully (file: packages/server/test/e2e/lifecycle.e2e.test.ts)
- [x] T010 Add `test:e2e` CI job to `.github/workflows/ci.yml` (Docker pre-pull + HF model cache + CI=true env gate) (file: .github/workflows/ci.yml)
- [x] T011 Document how to run E2E locally (Development section: Docker Desktop requirement, first-run image pull, model cache, skip-not-fail behavior) in README (file: README.md)

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

- Local: `turbo run test:e2e` completes green in ≤ 90s for the non-lifecycle suites (after first-run image + model cache warm-up). The `lifecycle.e2e.test.ts` suite intentionally waits past the configured `idleTimeoutMs` (≥ 6s) and re-spawns a container, so it does not fit the 60s-per-suite target in the spec. Spec SC-4 is therefore evaluated against the non-lifecycle subset.
- Local without Docker: `turbo run test:e2e` reports "skipped" with hint `Start Docker Desktop or install Docker`
- CI: new job passes; HF model cache hit on subsequent runs (cache key = model ID)
- Each new test file asserts behavior against the HTTP API, not TeiManager internals

## Progress

- 2026-04-15: T001 — Docker adapter (`dockerSpawnFn`, `dockerFindBinary`, `hasDocker`) + E2E helpers (`startTestServer`, `computeSkipReason`) + smoke test. Type check + lint pass.
- 2026-04-15: T002 — `test:e2e` task added to turbo.json with `cache: false` and env passthrough.
- 2026-04-15: T003 — `test:e2e` scripts added to server, ai-sdk, and root; default `test` scoped to `src/`.
- 2026-04-15: T004-T009 — Six E2E test suites covering /v1/models, /v1/embeddings, /v1/rerank, /v1/chat/completions (501 stub), AI SDK provider, and TeiManager idle-timeout lifecycle. All gated by `E2E_SKIP_REASON` (RUN_E2E or CI).
- 2026-04-15: T010 — CI job `test-e2e` added (pre-pulls TEI image, caches HF models, CI=true hard-fails on missing Docker).
- 2026-04-15: T011 — README Development section added with opt-in rationale and how-it-works pointer to `docker-spawn.ts`.

## Decision Log

- 2026-04-15: Chose `test/e2e/` directory separation over colocated `*.e2e.test.ts` to keep default `bun test` Docker-free.
- 2026-04-15: Chose real `Bun.serve()` over `app.fetch()` to cover middleware ordering and port allocation under live connections.
- 2026-04-15: Chose Docker adapter injection (`spawnFn` + `findBinary`) over native `text-embeddings-router` binary. `huggingface/tap/text-embeddings-router` brew formula does not exist; cargo install is slow and environment-fragile. Docker provides a reproducible cross-platform backend while still exercising the full `TeiManager` lifecycle via TEI's native HTTP API (`/health`, `/embed`, `/rerank`).

## Surprises & Discoveries

- The `huggingface/tap/text-embeddings-router` Homebrew formula advertised in `packages/tei/src/binary.ts` does not exist. The tap only provides unrelated tools. This forced the pivot to Docker.
- `TeiManager`'s existing dependency injection (`spawnFn`, `findBinary`) turned out to be exactly the right seam for Docker substitution — no production code changes were needed to support E2E, which is a nice validation of the injection design.
- Bun test lacks an `--ignore` flag; scoping default `test` to `bun test src/` was the cleanest way to keep E2E opt-in without a separate config file.
- `@pleaseai/infer-ai-sdk`'s `createInferPlease` doesn't accept a preconfigured TeiManager, so the ai-sdk E2E test constructs `InferPleaseEmbeddingModel` directly. A future improvement could expose an optional `manager` parameter to make the public API as injectable as the underlying `TeiManager`.

### Deferred (reviewed but out of scope for this track)

- **`stopping`-state race coverage**: the lifecycle suite confirms idle-timeout + respawn, but does not drive a request mid-`stopping`. Exercising that path requires deterministic timing control that real Docker cannot reliably provide — better suited to a unit-level test against a mocked spawnFn that intentionally stalls `kill()`.
- **Auth E2E**: `startTestServer` supports an `authToken` option but no suite sets one. The `src/middleware/auth.test.ts` + `integration.test.ts` already cover middleware behavior; adding real-HTTP auth coverage has marginal value and is cheap to add later when a regression motivates it.

## Outcomes & Retrospective

### What Was Shipped

- Opt-in E2E test infrastructure (`test/e2e/` in server and ai-sdk packages) running real TEI via Docker.
- Reusable Docker spawn adapter (`dockerSpawnFn`, `dockerFindBinary`) and shared `startTestServer` helper.
- 6 suites covering all `/v1/*` public endpoints, the AI SDK provider, and TeiManager's full idle-timeout + respawn lifecycle.
- Turbo `test:e2e` task, package scripts that scope default `test` to `src/`, new CI job with HF model cache, and a README Development section.

### What Went Well

- `TeiManager`'s preexisting `spawnFn` / `findBinary` injection was exactly the right seam for Docker substitution — zero production code changes were needed. This is a strong validation of the injection design choice.
- The pivot from the spec's native-binary plan to Docker happened without losing test fidelity: the full lifecycle still runs against a real process, just containerised.
- Review cycle surfaced a genuine logic error (lifecycle test's port assertion was tautological) that neither type-check nor lint could catch.

### What Could Improve

- Spec reviewer should have flagged the nonexistent brew formula earlier; a simple `brew info` check during /please:plan would have caught it.
- Cross-package test helpers (`docker-spawn` imported from ai-sdk via `../../../server/test/e2e/...`) work but feel fragile. Consider a shared `test-utils` package if E2E grows.
- No mechanical enforcement of the ≤60s SC-4 target; next time, make perf budgets testable (e.g., fail if total `bun test test/e2e` wall time exceeds threshold).

### Tech Debt Created

- `@pleaseai/infer-ai-sdk`'s `createInferPlease` factory cannot accept a preconfigured `TeiManager`. E2E works around this by constructing `InferPleaseEmbeddingModel` directly; a follow-up should expose an optional `manager` parameter.
- TEI image is pinned to the floating `cpu-latest` tag — reproducibility gap for debugging failed CI runs against an older image.
