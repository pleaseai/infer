# Architecture

> Agent-first architecture document for infer-please.

## System Overview

**Purpose**: A local AI Gateway that provides a single OpenAI-compatible endpoint managing multiple TEI and llama.cpp processes for embedding, reranking, and chat — with automatic lifecycle management.

**Primary users**: Developers building RAG pipelines, hybrid search, or local AI workflows who need embedding + reranking + chat behind one port.

**Core workflow**:

1. Client sends an OpenAI-compatible request (embedding, rerank, or chat) with a model name
2. Router identifies the model type and routes to the appropriate backend (TEI for embedding/rerank, llama-server for chat/GGUF)
3. If no backend process exists for that model, one is spawned automatically via `Bun.spawn()`
4. Request is proxied to the backend process; response is returned in OpenAI-compatible format
5. After idle timeout (default 5min), backend processes are automatically stopped to free resources

**Key constraints**:
- All backends are external binaries (TEI = Rust, llama.cpp = C++), managed but not bundled
- One TEI process per model (each listens on a unique port)
- Sub-second cold start target for TEI (~1s), transparent to callers
- CPU-first on macOS (Apple Silicon), GPU optional

## Dependency Layers

Dependencies flow downward only. Lower layers must not import upper layers.

```
┌─────────────────────────────────────────────────┐
│              User Code Layer                     │
│  AI SDK: embed(), embedMany()                    │
│  Direct: createTeiManager(), client.embed()      │
├─────────────────────────────────────────────────┤
│            SDK Adapter Layer                     │
│  @pleaseai/infer-ai-sdk                            │
│  EmbeddingModelV1 → TeiManager + TeiClient       │
├─────────────────────────────────────────────────┤
│              Core Layer                          │
│  @pleaseai/infer-tei                               │
│  TeiManager — process lifecycle, health, pool    │
│  TeiClient — TEI HTTP API (embed, rerank)        │
│  PortPool — dynamic port allocation              │
├─────────────────────────────────────────────────┤
│           Infrastructure Layer                   │
│  Bun.spawn() — external process management       │
│  HuggingFace Hub — model downloading (by TEI)    │
│  fetch — HTTP to TEI process (localhost)          │
├─────────────────────────────────────────────────┤
│           Interface Layer (planned)              │
│  CLI (infer) + HTTP API (Hono routes)     │
│  /v1/embeddings, /v1/rerank, /v1/models          │
└─────────────────────────────────────────────────┘
```

**Invariant**: Domain layer (managers) must not know about HTTP or route specifics. They expose a process lifecycle API; the application layer translates between OpenAI API shapes and backend-specific protocols.

## Entry Points

For understanding TEI process management:

- `packages/tei/src/tei-manager.ts` — TEI process lifecycle: spawn, health check, idle timeout, port allocation, crash recovery
- `packages/tei/src/tei-client.ts` — TEI HTTP API calls (embed, rerank)
- `packages/tei/src/index.ts` — `createTeiManager()` factory + barrel exports

For the Vercel AI SDK integration:

- `packages/ai-sdk/src/index.ts` — `createInferPlease()` provider factory
- `packages/ai-sdk/src/embedding-model.ts` — `EmbeddingModelV1<string>` implementation

For the HTTP API:

- `packages/server/src/index.ts` — CLI entry point (`infer start`)
- `packages/server/src/cli.ts` — argv parsing and config resolution
- `packages/server/src/app.ts` — `buildApp(config, backends)` wires routes + middleware + registry
- `packages/server/src/server.ts` — bare Hono factory with auth + OpenAI-format error handler
- `packages/server/src/config.ts` — zod schema + YAML loader for `infer.yaml`
- `packages/server/src/registry.ts` — model lookup and type validation
- `packages/server/src/errors.ts` — `ApiError` and OpenAI-format envelope helpers
- `packages/server/src/middleware/auth.ts` — optional Bearer token middleware
- `packages/server/src/routes/{models,embeddings,rerank,chat}.ts` — endpoint handlers
- `packages/server/src/translators/{embeddings,rerank}.ts` — OpenAI/Cohere ↔ TEI shape conversion

## Module Reference

### Monorepo Packages

| Package | npm Name | Purpose | Key Entry |
|---------|----------|---------|-----------|
| `packages/tei` | `@pleaseai/infer-tei` | TEI process management + API client | `src/index.ts` |
| `packages/ai-sdk` | `@pleaseai/infer-ai-sdk` | Vercel AI SDK provider (wraps tei) | `src/index.ts` |
| `packages/server` | `infer-please` | CLI + HTTP server (Hono routes + TEI dispatch) | `src/index.ts` |

### TEI Package Modules (`@pleaseai/infer-tei`)

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | Barrel export + `createTeiManager(options, runtime?)` factory | all modules | `@pleaseai/infer-ai-sdk`, `infer-please` |
| `src/tei-manager.ts` | TEI process lifecycle (spawn, health check, idle timeout, crash recovery) | `binary`, `port-pool`, `types` | `index` |
| `src/tei-client.ts` | TEI HTTP API client (embed, rerank) | `types` | `index`, `ai-sdk` |
| `src/port-pool.ts` | Dynamic port allocation/release (Set-based) | — | `tei-manager` |
| `src/binary.ts` | `text-embeddings-router` binary discovery on $PATH | — | `tei-manager`, `runtime/runtime-selector` |
| `src/types.ts` | Type definitions (TeiProcess, EmbedRequest, etc.) | — | all modules |
| `src/runtime/gpu-detect.ts` | `nvidia-smi --query-gpu=compute_cap` wrapper with injectable exec (5s timeout) | — | `runtime/runtime-selector` |
| `src/runtime/image-resolver.ts` | Pure function: GPU compute cap + arch + tag + override → TEI image reference | `gpu-detect` (type only) | `runtime/runtime-selector`, E2E helpers |
| `src/runtime/docker-spawn.ts` | Docker-backed `SpawnFn` factory (production); `hasDocker` probe | — | `runtime/runtime-selector`, E2E helpers |
| `src/runtime/runtime-selector.ts` | Decides native vs docker at start; resolves image, wires spawn/findBinary for `TeiManager` (NFR-1: one-shot detection) | `binary`, `runtime/*` | `index`, `infer-please` server |

### AI SDK Package Modules (`@pleaseai/infer-ai-sdk`)

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | `createInferPlease()` provider factory | `embedding-model`, `@pleaseai/infer-tei` | user code |
| `src/embedding-model.ts` | `EmbeddingModelV1<string>` implementation | `@pleaseai/infer-tei` | `index` |

### Server Internal Modules (`infer-please`)

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | CLI entry; spawns `Bun.serve` and a `TeiManager` | `app`, `cli`, `@pleaseai/infer-tei` | — |
| `src/cli.ts` | argv parsing + `infer.yaml` resolution | `config` | `index` |
| `src/app.ts` | `buildApp(config, backends)` wires registry, routes, backends | `server`, `routes/*`, `registry`, `@pleaseai/infer-tei` | `index`, integration tests |
| `src/server.ts` | Hono factory with auth + OpenAI-format error handler | `errors`, `middleware/auth` | `app` |
| `src/config.ts` | zod schema + YAML loader | `yaml`, `zod` | `cli`, `registry` |
| `src/registry.ts` | Model lookup, list, type-validate (`requireType`) | `errors`, `config` | `app`, `routes/*` |
| `src/errors.ts` | `ApiError` + OpenAI envelope factories | — | all routes, middleware, server |
| `src/middleware/auth.ts` | Optional Bearer token check | `errors` | `server` |
| `src/routes/models.ts` | `GET /v1/models[/:id]` | `registry`, `errors` | `app` |
| `src/routes/embeddings.ts` | `POST /v1/embeddings` + `Backends`/`TeiBackend` interface | `registry`, `translators/embeddings`, `errors`, `@pleaseai/infer-tei` | `app`, `routes/rerank` |
| `src/routes/rerank.ts` | `POST /v1/rerank` (Cohere shape) | `registry`, `translators/rerank`, `errors` | `app` |
| `src/routes/chat.ts` | `POST /v1/chat/completions` (501 stub) | `errors` | `app` |
| `src/translators/embeddings.ts` | OpenAI ↔ TEI request/response, base64 encode | `zod`, `@pleaseai/infer-tei` | `routes/embeddings` |
| `src/translators/rerank.ts` | Cohere ↔ TEI request/response, `score → relevance_score` | `zod`, `@pleaseai/infer-tei` | `routes/rerank` |

## Architecture Invariants

**Single responsibility for backends**: Each backend type (TEI, llama.cpp) has exactly one dedicated package. TEI process lifecycle lives in `@pleaseai/infer-tei`. All `Bun.spawn()` calls for TEI are in `TeiManager`. Do NOT scatter spawn calls across route handlers or SDK adapters.

**OpenAI API compatibility at the boundary**: When the HTTP server is implemented, all HTTP responses must conform to OpenAI API response shapes. Internal backend protocols (TEI REST API) are translated in the provider/client layer, never exposed to callers.

**One process per model**: Each model name maps to exactly one backend process. Do NOT multiplex multiple models into a single TEI instance — TEI only supports one model per process.

**No bundled binaries**: TEI and llama.cpp binaries are external prerequisites. Do NOT attempt to bundle, download, or compile these binaries as part of the build. The server should fail fast with a clear error if a required binary is not found on `$PATH`.

**Port pool isolation**: Backend processes use ports from a configured range (default: 8080-8099 for TEI). The `PortPool` class in `@pleaseai/infer-tei` allocates and reclaims ports. Do NOT hardcode port numbers in routes or SDK adapters.

## Cross-Cutting Concerns

**Error handling**: Backend process failures (crash, port conflict, model not found) must surface as OpenAI-compatible error responses with appropriate HTTP status codes. Process crashes should not bring down the main server — the manager marks the model as unavailable and re-spawns on the next request.

**Logging**: Use structured logging to stdout. Log process lifecycle events (spawn, ready, idle-stop, crash) at info level. Log request routing at debug level.

**Testing**: Bun test runner (`bun test`). Unit tests use dependency injection — `TeiManager` accepts injectable `spawnFn`, `fetchFn`, and `findBinary` functions. `TeiClient` accepts injectable `fetchFn`. No real TEI/llama binaries required for tests. Coverage target: >80% for new code.

**Configuration**: Optional `infer.yaml` at project root. Environment variables override config file values. Sensible defaults for all settings (port 3141, idle timeout 300s).

**Process health checks**: After spawning a backend process, the manager polls its health endpoint until ready (with timeout). Requests that arrive during startup are queued, not rejected.

## Quality Notes

**Well-tested** (target): Router logic, port allocation, idle timeout state machine — these are the core correctness concerns and should have thorough test coverage.

**Fragile** (anticipated): Process lifecycle edge cases — race conditions between idle timeout and incoming requests, port cleanup after crashes, zombie process detection.

**Technical debt**: Project is greenfield. Track debt in `.please/docs/tracks/tech-debt-tracker.md`.

---

_Last updated: 2026-04-15_

_Key ADRs: None yet — use `/standards:adr` to record architectural decisions._
