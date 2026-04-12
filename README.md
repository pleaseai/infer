# infer-please

> 추론해줘 — Local AI inference server for models that Ollama doesn't support.

Run HuggingFace models locally via **Transformers.js** (ONNX) and **node-llama-cpp** (GGUF) with a single command.

## Why?

Ollama is great, but it doesn't cover everything — embedding models like `jina-embeddings-v3`, rerankers like `bge-reranker-v2`, or niche ONNX-only architectures. **infer-please** fills that gap: a lightweight local server that dynamically loads and caches any supported model on first request.

## Features

- **Dynamic model loading** — request any model by name, loaded and cached on first use
- **Multi-backend** — Transformers.js (ONNX) + node-llama-cpp (GGUF)
- **OpenAI-compatible API** — drop-in replacement for `/v1/embeddings`, `/v1/chat/completions`
- **Reranking** — `/v1/rerank` endpoint for retrieval pipelines
- **Memory management** — list loaded models, unload on demand
- **Zero config** — `bunx infer-please` and you're running

## Quick Start

```bash
# Install
bun add -g infer-please

# Start server
ip start

# Or just run directly
bunx infer-please
```

Server starts on `http://localhost:3141`.

## API

### Embeddings

```bash
curl -X POST http://localhost:3141/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Xenova/all-MiniLM-L6-v2",
    "input": ["Hello world", "How are you?"]
  }'
```

### Rerank

```bash
curl -X POST http://localhost:3141/v1/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Xenova/ms-marco-MiniLM-L-6-v2",
    "query": "What is deep learning?",
    "documents": [
      "Deep learning is a subset of machine learning",
      "The weather is sunny today",
      "Neural networks have multiple layers"
    ]
  }'
```

### Chat Completions (via node-llama-cpp)

```bash
curl -X POST http://localhost:3141/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bartowski/Llama-3.2-1B-Instruct-GGUF",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'
```

### Model Management

```bash
# List loaded models
curl http://localhost:3141/v1/models

# Unload a model
curl -X DELETE http://localhost:3141/v1/models/feature-extraction/Xenova/all-MiniLM-L6-v2
```

## Configuration

```yaml
# infer-please.yaml (optional)
port: 3141
providers:
  transformers:
    dtype: q8                    # default quantization
    cacheDir: ~/.cache/infer-please/onnx
  llama-cpp:
    cacheDir: ~/.cache/infer-please/gguf
    gpu: auto                    # auto | none | metal | cuda | vulkan
```

## Popular Models

### Embedding

| Model | Dimensions | Speed | Notes |
|-------|-----------|-------|-------|
| `Xenova/all-MiniLM-L6-v2` | 384 | ⚡ Fast | Good default |
| `Xenova/bge-small-en-v1.5` | 384 | ⚡ Fast | Needs `query:` prefix |
| `jinaai/jina-embeddings-v3` | 1024 | 🐢 Slower | Multilingual, high quality |
| `nomic-ai/nomic-embed-text-v1.5` | 768 | ⚡ Fast | Good balance |

### Reranker

| Model | Notes |
|-------|-------|
| `Xenova/ms-marco-MiniLM-L-6-v2` | Fast, English |
| `Xenova/bge-reranker-base` | Better quality |

## Architecture

```
infer-please
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Hono app
│   ├── cache.ts              # Pipeline cache & memory management
│   ├── providers/
│   │   ├── transformers.ts   # @huggingface/transformers (ONNX)
│   │   └── llama-cpp.ts      # node-llama-cpp (GGUF)
│   └── routes/
│       ├── embeddings.ts     # /v1/embeddings
│       ├── rerank.ts         # /v1/rerank
│       ├── chat.ts           # /v1/chat/completions
│       └── models.ts         # /v1/models
├── infer-please.yaml         # Optional config
├── package.json
└── tsconfig.json
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono
- **ONNX Backend**: @huggingface/transformers
- **GGUF Backend**: node-llama-cpp
- **Language**: TypeScript

## Roadmap

- [ ] Transformers.js embedding & reranking
- [ ] Dynamic model loading with cache
- [ ] OpenAI-compatible API
- [ ] node-llama-cpp integration for chat
- [ ] CLI (`ip start`, `ip models`, `ip pull`)
- [ ] Batch inference endpoint
- [ ] WebGPU acceleration (Transformers.js v4)
- [ ] Docker image
- [ ] Metrics & health check endpoints

## Part of Please Tools

**infer-please** is part of the [Please Tools](https://pleaseai.dev) ecosystem.

## License

FSL-1.1-ALv2
