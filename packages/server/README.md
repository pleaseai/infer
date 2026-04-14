# @pleaseai/infer

OpenAI-compatible HTTP gateway for local embedding, reranking, and (future) chat inference. A single port serves multiple models, each backed by a TEI or llama.cpp process spawned on demand.

## Install

```bash
bun add -g @pleaseai/infer
```

## Start

```bash
infer start --config ./infer.yaml
```

| Flag                 | Description                                           |
| -------------------- | ----------------------------------------------------- |
| `-p, --port <port>`  | Bind port (default `3141`, overrides config)          |
| `-c, --config <path>`| Path to `infer.yaml`                                  |
| `-h, --help`         | Show help                                             |

## Endpoints

| Method | Path                  | Notes                                        |
| ------ | --------------------- | -------------------------------------------- |
| GET    | `/v1/models`          | OpenAI list of registered models             |
| GET    | `/v1/models/:id`      | Single OpenAI model record                   |
| POST   | `/v1/embeddings`      | OpenAI embeddings (`float` and `base64`)     |
| POST   | `/v1/rerank`          | Cohere `/v2/rerank`-compatible               |
| POST   | `/v1/chat/completions`| Returns 501 — implemented in a follow-up     |

All errors use the OpenAI envelope `{error: {message, type, code, param}}` with standard HTTP status codes (400/401/404/422/501/500).

## Configuration

`infer.yaml`:

```yaml
server:
  port: 3141 # default 3141
  host: 127.0.0.1 # default 127.0.0.1

# Bearer auth — omit the entire `auth` block to disable.
auth:
  token: change-me

models:
  - id: bge-small-en
    type: embedding
    backend: tei
    repo_id: BAAI/bge-small-en-v1.5

  - id: bge-reranker-base
    type: rerank
    backend: tei
    repo_id: BAAI/bge-reranker-base
```

| Field          | Required | Notes                                              |
| -------------- | -------- | -------------------------------------------------- |
| `id`           | yes      | Model id used in API requests                      |
| `type`         | yes      | `embedding`, `rerank`, or `chat`                   |
| `backend`      | yes      | `tei` (embedding/rerank) or `llama` (chat, future) |
| `repo_id`      | yes      | HuggingFace repo passed to the backend             |

## Client examples

### OpenAI Node SDK

```ts
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.INFER_PLEASE_TOKEN ?? 'unused',
  baseURL: 'http://localhost:3141/v1',
})

const r = await client.embeddings.create({
  model: 'bge-small-en',
  input: ['hello', 'world'],
})
```

### Vercel AI SDK

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { embed } from 'ai'

const provider = createOpenAICompatible({
  name: 'infer-please',
  baseURL: 'http://localhost:3141/v1',
})

const { embedding } = await embed({
  model: provider.textEmbeddingModel('bge-small-en'),
  value: 'hello',
})
```

### Rerank (Cohere shape)

```bash
curl -X POST http://localhost:3141/v1/rerank \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "bge-reranker-base",
    "query": "what is RAG?",
    "documents": ["doc one", "doc two", "doc three"],
    "top_n": 2,
    "return_documents": true
  }'
```

## Architecture

See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for the layered design (routes → registry → backend dispatch → `@pleaseai/infer-tei` process management).

## Development

```bash
bun install
bun test
bun run --watch src/index.ts start
```
