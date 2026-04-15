# Tech Stack

## Runtime & Language
| Technology | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | **Bun** | Fast startup, native TypeScript, `Bun.spawn()` for process management |
| Language | **TypeScript** | Type safety, ecosystem compatibility |

## Core Dependencies
| Category | Technology | Rationale |
|----------|-----------|-----------|
| HTTP Framework | **Hono** | Lightweight, fast, Bun-native, middleware ecosystem |
| HTTP Schema Validation | **zod** + `@hono/zod-validator` | 선언적 요청/응답 검증으로 스키마를 한 곳에서 관리 |
| Configuration | **yaml** | `infer.yaml` 파서 (modern, ESM, type-safe) |
| Embedding/Rerank Engine | **HuggingFace TEI** | Rust-based, Flash Attention, dynamic batching, supports both embedding and reranking |
| Chat Engine | **llama.cpp server** | C++ inference, broad GGUF model support, CPU/GPU flexible |
| Client SDK | **Vercel AI SDK** | Standard AI SDK for TypeScript, provider pattern |
| AI SDK Provider | **@ai-sdk/provider** | Vercel AI SDK EmbeddingModelV1 인터페이스 |

## Project Structure
| Type | Description |
|------|------------|
| Monorepo | Turborepo + Bun workspaces |
| Package Manager | Bun |
| Build System | Turborepo (task orchestration, caching) |
| Build (server) | `bun build` (bundler) |
| Build (ai-sdk) | `tsc` (compiled package) |
| Testing | Bun test runner (`bun test`) |
| Linting/Formatting | `@pleaseai/eslint-config` (ESLint as formatter, no Prettier) |

## Monorepo Packages
| Package | Name | Purpose |
|---------|------|---------|
| `packages/server` | `infer-please` | CLI + HTTP server (Hono), TEI/llama process management |
| `packages/tei` | `@pleaseai/infer-tei` | TEI 프로세스 관리 + API 클라이언트 |
| `packages/ai-sdk` | `@pleaseai/infer-ai-sdk` | Vercel AI SDK provider |

## External Binaries (managed, not bundled)
- `text-embeddings-router` — TEI binary (native runtime; installed via Homebrew)
- TEI Docker images (`ghcr.io/huggingface/text-embeddings-inference`, default tag `1.9`) — auto-selected per host GPU compute capability + arch when `tei.runtime: auto|docker`
- `llama-server` — llama.cpp server binary (installed via Homebrew; Docker variant out of scope)

## TEI Runtime Selection (`tei.runtime`)
Production code path mirrors the E2E test path via a shared `createDockerSpawn` factory in `@pleaseai/infer-tei`. `runtime-selector.ts` decides mode (native|docker|auto) once at server start, then injects the resolved `spawnFn`/`findBinary` into `TeiManager` — lifecycle (health check, idle timeout, crash recovery) is identical across modes. Default is `auto`: prefer Docker if available, otherwise fall back to the native binary.

## Deployment Targets
- macOS (primary — Apple Silicon + Intel)
- Linux (server deployments)
- Docker runtime (first-class path, not optional)
