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
│  @infer-please/ai-sdk                            │
│  EmbeddingModelV1 → TeiManager + TeiClient       │
├─────────────────────────────────────────────────┤
│              Core Layer                          │
│  @infer-please/tei                               │
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
│  CLI (infer-please) + HTTP API (Hono routes)     │
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

For the HTTP API (planned):

- `packages/server/src/index.ts` — CLI entry point (skeleton)

## Module Reference

### Monorepo Packages

| Package | npm Name | Purpose | Key Entry |
|---------|----------|---------|-----------|
| `packages/tei` | `@infer-please/tei` | TEI process management + API client | `src/index.ts` |
| `packages/ai-sdk` | `@infer-please/ai-sdk` | Vercel AI SDK provider (wraps tei) | `src/index.ts` |
| `packages/server` | `infer-please` | CLI + HTTP server (planned) | `src/index.ts` |

### TEI Package Modules (`@infer-please/tei`)

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | Barrel export + `createTeiManager()` factory | all modules | `@infer-please/ai-sdk` |
| `src/tei-manager.ts` | TEI process lifecycle (spawn, health check, idle timeout, crash recovery) | `binary`, `port-pool`, `types` | `index` |
| `src/tei-client.ts` | TEI HTTP API client (embed, rerank) | `types` | `index`, `ai-sdk` |
| `src/port-pool.ts` | Dynamic port allocation/release (Set-based) | — | `tei-manager` |
| `src/binary.ts` | `text-embeddings-router` binary discovery on $PATH | — | `tei-manager` |
| `src/types.ts` | Type definitions (TeiProcess, EmbedRequest, etc.) | — | all modules |

### AI SDK Package Modules (`@infer-please/ai-sdk`)

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | `createInferPlease()` provider factory | `embedding-model`, `@infer-please/tei` | user code |
| `src/embedding-model.ts` | `EmbeddingModelV1<string>` implementation | `@infer-please/tei` | `index` |

### Server Internal Modules (planned)

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | CLI entry point, starts server | `server.ts` | — |
| `src/server.ts` | Hono HTTP app, route wiring | `routes/*`, `@infer-please/tei` | `index.ts` |

## Architecture Invariants

**Single responsibility for backends**: Each backend type (TEI, llama.cpp) has exactly one dedicated package. TEI process lifecycle lives in `@infer-please/tei`. All `Bun.spawn()` calls for TEI are in `TeiManager`. Do NOT scatter spawn calls across route handlers or SDK adapters.

**OpenAI API compatibility at the boundary**: When the HTTP server is implemented, all HTTP responses must conform to OpenAI API response shapes. Internal backend protocols (TEI REST API) are translated in the provider/client layer, never exposed to callers.

**One process per model**: Each model name maps to exactly one backend process. Do NOT multiplex multiple models into a single TEI instance — TEI only supports one model per process.

**No bundled binaries**: TEI and llama.cpp binaries are external prerequisites. Do NOT attempt to bundle, download, or compile these binaries as part of the build. The server should fail fast with a clear error if a required binary is not found on `$PATH`.

**Port pool isolation**: Backend processes use ports from a configured range (default: 8080-8099 for TEI). The `PortPool` class in `@infer-please/tei` allocates and reclaims ports. Do NOT hardcode port numbers in routes or SDK adapters.

## Cross-Cutting Concerns

**Error handling**: Backend process failures (crash, port conflict, model not found) must surface as OpenAI-compatible error responses with appropriate HTTP status codes. Process crashes should not bring down the main server — the manager marks the model as unavailable and re-spawns on the next request.

**Logging**: Use structured logging to stdout. Log process lifecycle events (spawn, ready, idle-stop, crash) at info level. Log request routing at debug level.

**Testing**: Bun test runner (`bun test`). Unit tests use dependency injection — `TeiManager` accepts injectable `spawnFn`, `fetchFn`, and `findBinary` functions. `TeiClient` accepts injectable `fetchFn`. No real TEI/llama binaries required for tests. Coverage target: >80% for new code.

**Configuration**: Optional `infer-please.yaml` at project root. Environment variables override config file values. Sensible defaults for all settings (port 3141, idle timeout 300s).

**Process health checks**: After spawning a backend process, the manager polls its health endpoint until ready (with timeout). Requests that arrive during startup are queued, not rejected.

## Quality Notes

**Well-tested** (target): Router logic, port allocation, idle timeout state machine — these are the core correctness concerns and should have thorough test coverage.

**Fragile** (anticipated): Process lifecycle edge cases — race conditions between idle timeout and incoming requests, port cleanup after crashes, zombie process detection.

**Technical debt**: Project is greenfield. Track debt in `.please/docs/tracks/tech-debt-tracker.md`.

---

_Last updated: 2026-04-13_

_Key ADRs: None yet — use `/standards:adr` to record architectural decisions._
