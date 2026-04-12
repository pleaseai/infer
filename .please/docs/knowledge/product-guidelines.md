# Product Guidelines

## Design Principles

### 1. Zero Configuration
Users should be able to start the server and immediately use any model by name. No pre-configuration required — models are fetched and loaded on first request.

### 2. OpenAI Compatibility
All endpoints follow the OpenAI API specification. Any OpenAI SDK client should work out of the box by changing only `baseURL`.

### 3. Transparent Process Management
Backend processes (TEI, llama-server) are implementation details. Users interact only with the unified API — lifecycle management (spawn, health check, idle timeout, cleanup) is fully automatic.

### 4. Local-First
Designed for local development and on-premise deployment. No cloud dependency. Privacy by default.

### 5. Composable
Works with any OpenAI-compatible client. Provides a dedicated Vercel AI SDK provider for first-class TypeScript integration.

## API Design
- Follow OpenAI API conventions for all standard endpoints
- Use `/v1/rerank` (Cohere-style) for the reranking endpoint
- Return standard OpenAI error shapes for all error responses
- Model names use HuggingFace Hub format: `org/model-name`

## Naming Conventions
- Package: `infer-please` (npm)
- SDK package: `@infer-please/ai-sdk`
- CLI command: `infer-please`
- Config file: `infer-please.yaml`
- Default port: `3141`

## Error Handling
- Surface backend errors (TEI, llama.cpp) as OpenAI-compatible error responses
- Provide clear error messages when binaries are not installed
- Gracefully handle process crashes with automatic restart on next request
