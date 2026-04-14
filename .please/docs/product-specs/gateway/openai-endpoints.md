---
id: SPEC-001
level: V_M
domain: gateway
feature: openai-endpoints
depends: []
conflicts: []
traces: []
created_at: 2026-04-14T00:00:00Z
updated_at: 2026-04-14T00:00:00Z
source_tracks: ["ai-gateway-endpoints-20260414"]
---

# OpenAI-Compatible HTTP Gateway Endpoints Specification

## Purpose

Vercel AI Gateway 수준의 OpenAI 호환 HTTP API를 제공하여 기존 OpenAI 클라이언트가 baseURL 변경만으로 로컬 infer-please를 사용할 수 있도록 한다.

## Requirements

### Requirement: Hono HTTP server exposes five endpoints on a single port

The system MUST expose `GET /v1/models`, `GET /v1/models/{id}`, `POST /v1/embeddings`, `POST /v1/rerank`, and `POST /v1/chat/completions` on a single configurable port (default 3141) via a Hono application.

#### Scenario: single-port endpoint exposure

- GIVEN infer-please is started with its default configuration
- WHEN a client issues requests to any of the five documented paths on port 3141
- THEN the server routes each request to its corresponding handler

### Requirement: Models endpoint returns OpenAI-schema model records from a static registry

The system MUST expose `/v1/models` and `/v1/models/{id}` returning `{id, object:'model', created, owned_by}` shapes sourced from the `models` array in `infer.yaml`.

#### Scenario: list and retrieve registered models

- GIVEN `infer.yaml` registers at least one model
- WHEN a client calls `GET /v1/models` or `GET /v1/models/{id}`
- THEN the server returns the registered models in OpenAI Model schema

### Requirement: Embeddings endpoint accepts OpenAI shape and dispatches to TEI

The system MUST accept `POST /v1/embeddings` with `{model, input, encoding_format?, dimensions?}`, dispatch the request through the TEI backend, and respond with `{object:'list', data:[{embedding, index, object:'embedding'}], model, usage}`. Both string and array inputs are supported.

#### Scenario: embedding generation round-trip

- GIVEN a model of type `embedding` backed by TEI is registered
- WHEN a client calls `POST /v1/embeddings` with a valid OpenAI request
- THEN the server returns a well-formed OpenAI `Embedding` response derived from the TEI backend output

### Requirement: Rerank endpoint exposes Cohere v2 shape over TEI rerank

The system MUST accept `POST /v1/rerank` with `{model, query, documents, top_n?, return_documents?}`, call the TEI rerank backend, and respond with `{results:[{index, relevance_score, document?}], model, usage}` sorted by `relevance_score` descending.

#### Scenario: Cohere-compatible rerank

- GIVEN a model of type `rerank` backed by TEI is registered
- WHEN a client calls `POST /v1/rerank` with query and documents
- THEN the server returns results ordered by relevance descending in the Cohere v2 shape

### Requirement: Chat completions endpoint returns OpenAI-format 501

The system MUST register `POST /v1/chat/completions` but respond with HTTP 501 and `{error:{message:'chat backend not implemented', type:'not_implemented_error', code:'backend_unavailable'}}` until a chat backend is implemented.

#### Scenario: chat not implemented

- GIVEN a chat backend has not yet shipped
- WHEN a client calls `POST /v1/chat/completions`
- THEN the server returns HTTP 501 with the OpenAI-format error envelope

### Requirement: All error responses follow the OpenAI envelope

The system MUST return every error as `{error:{message, type, param?, code}}` with standard HTTP status codes (400, 401, 404, 422, 429, 500, 501).

#### Scenario: OpenAI error envelope

- GIVEN a request fails at any layer (schema, auth, registry, backend)
- WHEN the failure is surfaced to the client
- THEN the response body follows the OpenAI error envelope with an appropriate HTTP status

### Requirement: Configuration file schema

The system MUST parse `infer.yaml` with at minimum `server.port` (default 3141), `server.host` (default '127.0.0.1'), optional `auth.token`, and a `models` array of `{id, type, backend, repo_id, ...backend_opts}`.

#### Scenario: config parsing

- GIVEN a valid `infer.yaml` on disk
- WHEN the server starts with `--config` pointing at that file
- THEN the server honors the parsed port, host, auth, and model registry

### Requirement: Bearer auth middleware when auth.token is configured

The system MUST verify the `Authorization: Bearer <token>` header on every request when `auth.token` is set, returning 401 with the OpenAI error envelope for missing or mismatched tokens. When `auth.token` is unset, authentication is disabled.

#### Scenario: Bearer token enforcement

- GIVEN `auth.token` is configured
- WHEN a client sends no Authorization header or a mismatching token
- THEN the server returns HTTP 401 with an `authentication_error` envelope

### Requirement: Model-endpoint type validation

The system MUST return HTTP 400 when an endpoint receives a model whose declared `type` does not match the endpoint's expected type (for example an `embedding` model requested at `/v1/rerank`).

#### Scenario: type mismatch

- GIVEN an embedding-type model is requested at the rerank endpoint
- WHEN the request reaches the registry lookup
- THEN the server returns HTTP 400 with code `invalid_model_type`

### Requirement: Unknown model id returns 404

The system MUST return HTTP 404 with `{type:'invalid_request_error', code:'model_not_found'}` when a request references a model id that is not present in the registry.

#### Scenario: unknown model

- GIVEN a request references a model id not in the registry
- WHEN the server looks up the model
- THEN the server returns HTTP 404 with the `model_not_found` envelope

### Requirement: CLI start command

The system MUST expose an `infer start [--port <port>] [--config <path>]` command that launches the HTTP server using the resolved configuration.

#### Scenario: CLI startup

- GIVEN the `infer` binary is installed
- WHEN the operator runs `infer start --port 3141`
- THEN the server begins listening on port 3141 with endpoints ready to serve

## Non-functional Requirements

### Requirement: Route handlers depend only on lower layers

The system SHOULD keep route handlers dependent on lower layers (`@pleaseai/infer-tei`, registry, translators) only — they SHOULD NOT call `Bun.spawn()` directly.

### Requirement: Test coverage exceeds 80%

The system SHOULD maintain greater than 80% test coverage on the server package, including Hono handlers, routing logic, schema validation, and auth middleware.

### Requirement: Cold-start requests are queued, not rejected

The system SHOULD queue requests that arrive during TEI cold start rather than rejecting them, reusing the existing `TeiManager` health-check semantics.

### Requirement: OpenAI Node SDK, AI SDK, and curl compatibility

The system SHOULD return responses that are parsed successfully by the OpenAI Node SDK v4+, `@ai-sdk/openai-compatible` (latest), and raw `curl` clients for every endpoint except chat completions.
