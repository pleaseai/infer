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
│              Interface Layer                     │
│  CLI (index.ts) + HTTP API (Hono routes)        │
│  /v1/embeddings, /v1/rerank, /v1/chat, /v1/models │
├─────────────────────────────────────────────────┤
│            Application Layer                     │
│  Router — model name → backend dispatch          │
│  Request/response transformation (OpenAI ↔ TEI)  │
├─────────────────────────────────────────────────┤
│              Domain Layer                        │
│  TEI Manager — process lifecycle, health, pool   │
│  Llama Manager — process lifecycle, health       │
│  Model registry — loaded models, port allocation │
├─────────────────────────────────────────────────┤
│           Infrastructure Layer                   │
│  Bun.spawn() — external process management       │
│  HuggingFace Hub — model downloading             │
│  File system — config, model cache               │
└─────────────────────────────────────────────────┘
```

**Invariant**: Domain layer (managers) must not know about HTTP or route specifics. They expose a process lifecycle API; the application layer translates between OpenAI API shapes and backend-specific protocols.

## Entry Points

For understanding the HTTP API:

- `packages/server/src/server.ts` — Hono app setup, route registration, middleware
- `packages/server/src/routes/embeddings.ts` — `/v1/embeddings` handler (most common request path)
- `packages/server/src/routes/rerank.ts` — `/v1/rerank` handler (key differentiator)

For understanding process management:

- `packages/server/src/tei-manager.ts` — TEI process lifecycle: spawn, health check, idle timeout, port allocation
- `packages/server/src/llama-manager.ts` — llama-server process lifecycle

For understanding the routing layer:

- `packages/server/src/router.ts` — Model name → backend type resolution and dispatch

For the Vercel AI SDK integration:

- `packages/ai-sdk/src/index.ts` — `createInferPlease()` provider factory

## Module Reference

### Monorepo Packages

| Package | npm Name | Purpose | Key Entry |
|---------|----------|---------|-----------|
| `packages/server` | `infer-please` | CLI + HTTP server + process managers | `src/index.ts` |
| `packages/ai-sdk` | `@infer-please/ai-sdk` | Vercel AI SDK provider | `src/index.ts` |

### Server Internal Modules

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| `src/index.ts` | CLI entry point, starts server | `server.ts` | — |
| `src/server.ts` | Hono HTTP app, route wiring | `routes/*` | `index.ts` |
| `src/router.ts` | Model → backend routing logic | `tei-manager`, `llama-manager` | `routes/*` |
| `src/tei-manager.ts` | TEI process lifecycle (spawn, health, idle, port pool) | `Bun.spawn` | `router`, `providers/tei` |
| `src/llama-manager.ts` | llama-server process lifecycle | `Bun.spawn` | `router`, `providers/llama-server` |
| `src/providers/tei.ts` | TEI HTTP proxy (embed + rerank) | `tei-manager` | `routes/embeddings`, `routes/rerank` |
| `src/providers/llama-server.ts` | llama.cpp server HTTP proxy (chat) | `llama-manager` | `routes/chat` |
| `src/routes/embeddings.ts` | `POST /v1/embeddings` | `providers/tei` | `server` |
| `src/routes/rerank.ts` | `POST /v1/rerank` | `providers/tei` | `server` |
| `src/routes/chat.ts` | `POST /v1/chat/completions` | `providers/llama-server` | `server` |
| `src/routes/models.ts` | `GET /v1/models`, `DELETE /v1/models/:id` | `tei-manager`, `llama-manager` | `server` |

## Architecture Invariants

**Single responsibility for backends**: Each backend type (TEI, llama.cpp) has exactly one manager module. All process lifecycle logic (spawn, kill, health check, port allocation) lives in the manager. Do NOT scatter `Bun.spawn()` calls across route handlers or providers.

**OpenAI API compatibility at the boundary**: All HTTP responses must conform to OpenAI API response shapes. Internal backend protocols (TEI REST API, llama.cpp API) are translated in the provider layer, never exposed to callers.

**One process per model**: Each model name maps to exactly one backend process. Do NOT multiplex multiple models into a single TEI instance — TEI only supports one model per process.

**No bundled binaries**: TEI and llama.cpp binaries are external prerequisites. Do NOT attempt to bundle, download, or compile these binaries as part of the build. The server should fail fast with a clear error if a required binary is not found on `$PATH`.

**Port pool isolation**: Backend processes use ports from a configured range (default: 8080-8099 for TEI, 8090+ for llama). The manager allocates and reclaims ports. Do NOT hardcode port numbers in routes or providers.

## Cross-Cutting Concerns

**Error handling**: Backend process failures (crash, port conflict, model not found) must surface as OpenAI-compatible error responses with appropriate HTTP status codes. Process crashes should not bring down the main server — the manager marks the model as unavailable and re-spawns on the next request.

**Logging**: Use structured logging to stdout. Log process lifecycle events (spawn, ready, idle-stop, crash) at info level. Log request routing at debug level.

**Testing**: Bun test runner (`bun test`). Unit tests for routing logic and manager state machines. Integration tests mock `Bun.spawn()` to avoid requiring actual TEI/llama binaries. Coverage target: >80% for new code.

**Configuration**: Optional `infer-please.yaml` at project root. Environment variables override config file values. Sensible defaults for all settings (port 3141, idle timeout 300s).

**Process health checks**: After spawning a backend process, the manager polls its health endpoint until ready (with timeout). Requests that arrive during startup are queued, not rejected.

## Quality Notes

**Well-tested** (target): Router logic, port allocation, idle timeout state machine — these are the core correctness concerns and should have thorough test coverage.

**Fragile** (anticipated): Process lifecycle edge cases — race conditions between idle timeout and incoming requests, port cleanup after crashes, zombie process detection.

**Technical debt**: Project is greenfield. Track debt in `.please/docs/tracks/tech-debt-tracker.md`.

---

_Last updated: 2026-04-12_

_Key ADRs: None yet — use `/standards:adr` to record architectural decisions._
