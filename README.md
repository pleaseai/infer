# infer-please

> 추론해줘 — Local AI Gateway with reranking. Like Vercel AI Gateway, but runs on your machine.

A single OpenAI-compatible endpoint that manages multiple [TEI](https://github.com/huggingface/text-embeddings-inference) and [llama.cpp](https://github.com/ggml-org/llama.cpp) processes for you. Request any model by name — it starts, serves, and stops automatically.

## Why?

Cloud embedding APIs are cheap ($0.02/M tokens). Use them when you can.

But when you need **reranking**, **privacy**, or **offline** — there's no single tool that does it all:

| Tool | Embedding | Reranker | Chat | Multi-model | Dynamic loading |
|------|-----------|----------|------|-------------|-----------------|
| Vercel AI Gateway | ✅ | ❌ | ✅ | ✅ | ✅ |
| Workers AI | ✅ | ❌ | ✅ | ⚠️ fixed set | ❌ |
| HF TEI | ✅ | ✅ | ❌ | ❌ 1 per process | ❌ |
| Ollama | ✅ | ❌ | ✅ | ✅ | ✅ |
| vLLM | ✅ | ✅ | ✅ | ❌ | ❌ |
| **infer-please** | ✅ | ✅ | ✅ | ✅ | ✅ |

infer-please wraps TEI (Rust, Flash Attention, dynamic batching) for embedding/reranking and llama.cpp server for chat — behind one port, with automatic lifecycle management. All backends are external Rust/C++ binaries managed via `Bun.spawn()`.

## Quick Start

```bash
# Prerequisites
brew install text-embeddings-inference  # or Docker
brew install llama.cpp                  # for chat (optional)

# Install
bun add -g @pleaseai/infer

# Start
infer start
# Server running on http://localhost:3141
```

## Usage

### OpenAI SDK (any language)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3141/v1",
  apiKey: "not-needed",
});

// Embedding — first request starts TEI automatically
const embed = await client.embeddings.create({
  model: "BAAI/bge-small-en-v1.5",
  input: ["hello world", "how are you?"],
});

// Different model — new TEI instance spins up
const embed2 = await client.embeddings.create({
  model: "Qwen/Qwen3-Embedding-0.6B",
  input: ["你好世界"],
});

// Chat — routes to node-llama-cpp
const chat = await client.chat.completions.create({
  model: "bartowski/Llama-3.2-1B-Instruct-GGUF",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Vercel AI SDK

```typescript
import { embed, embedMany, generateText } from "ai";
import { createInferPlease } from "@pleaseai/infer-ai-sdk";

const infer = createInferPlease(); // defaults to localhost:3141

const { embedding } = await embed({
  model: infer.textEmbeddingModel("BAAI/bge-small-en-v1.5"),
  value: "hello world",
});

const { embeddings } = await embedMany({
  model: infer.textEmbeddingModel("Qwen/Qwen3-Embedding-0.6B"),
  values: ["hello", "world"],
});

const { text } = await generateText({
  model: infer.languageModel("bartowski/Qwen2.5-3B-Instruct-GGUF"),
  prompt: "Explain transformers",
});
```

### Reranking

```bash
curl -X POST http://localhost:3141/v1/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model": "BAAI/bge-reranker-large",
    "query": "What is deep learning?",
    "documents": [
      "Deep learning is a subset of machine learning",
      "The weather is sunny today",
      "Neural networks have multiple layers"
    ]
  }'
```

### Model Management

```bash
# List loaded models
curl http://localhost:3141/v1/models

# Unload a model (frees memory)
curl -X DELETE http://localhost:3141/v1/models/BAAI/bge-small-en-v1.5
```

### Use with QMD

```bash
# QMD uses OpenAI-compatible API — just point it at infer-please
export OPENAI_BASE_URL="http://localhost:3141/v1"
export OPENAI_API_KEY="not-needed"
qmd embed && qmd query "search something"
```

## How It Works

```
Client (OpenAI SDK / Vercel AI SDK / curl)
  │
  │  POST /v1/embeddings   { "model": "BAAI/bge-small-en-v1.5" }
  │  POST /v1/rerank        { "model": "BAAI/bge-reranker-large" }
  │  POST /v1/chat/completions { "model": "...-GGUF" }
  │
  ▼
infer-please (:3141)
  │
  │  Route by model + task
  │
  ├── ONNX model → TEI process (auto-spawned)
  │   ├── BAAI/bge-small-en-v1.5    → :8080
  │   ├── BAAI/bge-reranker-large   → :8081
  │   └── Qwen/Qwen3-Embedding-0.6B → :8082 (started on first request)
  │
  └── GGUF model → llama-server process (auto-spawned)
      └── bartowski/Llama-3.2-1B-Instruct-GGUF → :8090

  ⏱️ Idle 5min → TEI process auto-stopped
  📡 Next request → TEI process auto-restarted (~1s)
```

## When to Use What

| Scenario | Recommendation |
|----------|---------------|
| Embedding only, no infra | ☁️ **Vercel AI Gateway** ($0.02/M tokens) |
| Embedding only, Cloudflare stack | ☁️ **Workers AI** (~free) |
| **Embedding + Reranking** | 🖥️ **infer-please** |
| Hybrid search pipeline (QMD-like) | 🖥️ **infer-please** |
| Privacy / air-gapped | 🖥️ **infer-please** |
| Low latency (<10ms) | 🖥️ **infer-please** |
| Flexible — cloud first, local fallback | 🖥️ **@pleaseai/infer-ai-sdk** |

## Popular Models

### Embedding

| Model | Dims | Speed | Notes |
|-------|------|-------|-------|
| `BAAI/bge-small-en-v1.5` | 384 | ⚡ | Good default, English |
| `BAAI/bge-large-en-v1.5` | 1024 | ⚡ | Higher quality |
| `Qwen/Qwen3-Embedding-0.6B` | — | ⚡ | Multilingual, 119 languages |
| `nomic-ai/nomic-embed-text-v1.5` | 768 | ⚡ | Open-source, good balance |
| `jinaai/jina-embeddings-v3` | 1024 | 🐢 | Multilingual, not in Ollama |

### Reranker

| Model | Notes |
|-------|-------|
| `BAAI/bge-reranker-large` | Good quality, English |
| `BAAI/bge-reranker-v2-m3` | Multilingual |
| `Qwen/Qwen3-Reranker-0.6B` | Lightweight, used by QMD |

### Chat (GGUF)

| Model | Notes |
|-------|-------|
| `bartowski/Llama-3.2-1B-Instruct-GGUF` | Small, fast |
| `bartowski/Qwen2.5-3B-Instruct-GGUF` | Multilingual |

## Configuration

```yaml
# infer.yaml (optional)
port: 3141

tei:
  binary: text-embeddings-router  # or docker
  idleTimeout: 300                # seconds before auto-stop
  portRange: [8080, 8099]         # internal port pool

llama:
  binary: llama-server           # llama.cpp server binary
  gpu: auto                       # auto | none | metal | cuda | vulkan

models:
  # Pre-load on startup (optional)
  - model: BAAI/bge-small-en-v1.5
    task: embedding
  - model: BAAI/bge-reranker-large
    task: rerank
```

## Architecture

```
infer-please/
├── packages/
│   └── ai-sdk/                # @pleaseai/infer-ai-sdk
│       └── index.ts           #   Vercel AI SDK provider
├── src/
│   ├── index.ts               # CLI entry point
│   ├── server.ts              # Hono + OpenAI-compatible routes
│   ├── tei-manager.ts         # TEI process lifecycle (Bun.spawn)
│   ├── llama-manager.ts       # llama-server process lifecycle (Bun.spawn)
│   ├── router.ts              # Model → backend routing
│   ├── providers/
│   │   ├── tei.ts             # TEI proxy (embed + rerank)
│   │   └── llama-server.ts    # llama.cpp server proxy (chat)
│   └── routes/
│       ├── embeddings.ts      # /v1/embeddings
│       ├── rerank.ts          # /v1/rerank
│       ├── chat.ts            # /v1/chat/completions
│       └── models.ts          # /v1/models
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Embedding/Rerank engine**: HuggingFace TEI (Rust, via `Bun.spawn()`)
- **Chat engine**: llama.cpp server (C++, via `Bun.spawn()`)
- **Client SDK**: Vercel AI SDK provider
- **Language**: TypeScript

## Roadmap

- [ ] TEI process manager (spawn, health check, idle timeout)
- [ ] OpenAI-compatible `/v1/embeddings` proxy
- [ ] OpenAI-compatible `/v1/rerank` proxy
- [ ] Model → TEI instance routing
- [ ] llama.cpp server chat integration
- [ ] `@pleaseai/infer-ai-sdk` provider package
- [ ] CLI (`infer start`, `models`, `pull`)
- [ ] Pre-load models on startup
- [ ] Docker mode (TEI as containers instead of binary)
- [ ] Streaming chat (SSE)
- [ ] Metrics & health check
- [ ] Vercel AI Gateway fallback (local-first, cloud-backup)

## Development

### Running tests

```bash
bun run test           # Fast unit/integration tests (no Docker required)
bun run test:e2e       # End-to-end tests against real TEI in Docker
```

The default `test` script runs only `src/*.test.ts` and uses in-process mocks for TEI — fast, Docker-free, safe to run on every commit.

### E2E tests

E2E tests live in `packages/{server,ai-sdk}/test/e2e/` and exercise the full request path against a real TEI backend running in Docker. They are **opt-in**: the default `bun run test` skips them.

**Prerequisites:**

- Docker Desktop (macOS/Windows) or Docker Engine (Linux), running
- The first run pulls `ghcr.io/huggingface/text-embeddings-inference:cpu-latest` (~700 MB) and downloads the `sentence-transformers/all-MiniLM-L6-v2` model (~22 MB). Subsequent runs reuse both via the HuggingFace cache at `~/.cache/huggingface`.

**Running locally:**

```bash
bun run test:e2e
# or run a single suite:
cd packages/server && RUN_E2E=1 bun test test/e2e/embeddings.e2e.test.ts
```

If Docker is not running, suites skip with an actionable message instead of failing. In CI (`CI=true`), a missing Docker is a hard failure.

**How it works:** E2E tests inject a Docker-backed `spawnFn` into `TeiManager` in place of the default `Bun.spawn()` path. `TeiManager`'s spawn / health-check / idle-timeout / crash-recovery lifecycle runs unchanged, and `TeiClient` talks to TEI's native HTTP API at the container's mapped port. See `packages/server/test/e2e/docker-spawn.ts`.

## Part of Please Tools

**infer-please** is part of the [Please Tools](https://pleaseai.dev) ecosystem.

## License

FSL-1.1-ALv2
