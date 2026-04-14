# Product Guide

## Product Name
infer-please (추론해줘)

## Vision
A local AI Gateway that provides a single OpenAI-compatible endpoint for managing multiple embedding, reranking, and chat inference backends — enabling privacy-first, offline-capable AI workflows without cloud dependency.

## Problem Statement
Cloud embedding APIs are affordable, but when you need **reranking**, **privacy**, or **offline** capability, no single tool covers all use cases. TEI handles embedding/reranking but only one model per process. Ollama lacks reranking. vLLM lacks multi-model dynamic loading. infer-please unifies these capabilities behind one port with automatic lifecycle management.

## Target Users
- Developers building RAG pipelines with hybrid search (embedding + reranking)
- Teams requiring local/private AI inference (air-gapped, on-premise)
- Users of QMD or similar tools needing a local OpenAI-compatible embedding server
- Developers wanting a Vercel AI Gateway-like experience locally

## Core Capabilities
1. **Multi-model serving** — Request any model by name; separate processes are spawned per model
2. **Dynamic loading** — Models start on first request, stop after idle timeout (~1s cold start)
3. **Embedding** — OpenAI-compatible `/v1/embeddings` via TEI backend
4. **Reranking** — `/v1/rerank` endpoint via TEI backend (key differentiator)
5. **Chat** — `/v1/chat/completions` via llama.cpp server backend
6. **SDK integration** — `@pleaseai/infer-ai-sdk` Vercel AI SDK provider package

## Key Differentiators
- **Reranking support** — Unlike Ollama and Vercel AI Gateway
- **Multi-model + dynamic loading** — Unlike TEI (1 per process) and vLLM (static)
- **Single port** — All capabilities behind one endpoint (:3141)
- **Backend-agnostic** — TEI for embedding/rerank, llama.cpp for chat; external binaries managed via `Bun.spawn()`

## Distribution
- npm/bun global install: `bun add -g @pleaseai/infer`
- CLI: `infer start`

## Part Of
[Please Tools](https://pleaseai.dev) ecosystem
