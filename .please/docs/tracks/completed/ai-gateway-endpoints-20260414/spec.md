---
product_spec_domain: gateway/openai-endpoints
---

# OpenAI-Compatible HTTP Gateway Endpoints

> Track: ai-gateway-endpoints-20260414

## Overview

Vercel AI Gateway와 동등한 OpenAI 호환 HTTP API를 `packages/server`에 구현한다. 단일 포트(:3141)에서 `/v1/models`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank` 엔드포인트를 제공하며, 기존 OpenAI 클라이언트(TS/Python SDK, AI SDK `@ai-sdk/openai-compatible`)가 baseURL만 변경하여 코드 수정 없이 사용 가능하도록 한다. 채팅 백엔드(llama.cpp)는 별도 트랙에서 작업하므로, 채팅 라우트는 스켈레톤으로 등록 후 OpenAI 스타일 501 응답을 반환한다.

## Requirements

### Functional Requirements

- [ ] FR-1: Hono 기반 HTTP 서버가 단일 포트(기본 :3141)에서 아래 엔드포인트를 노출한다.
  - `GET  /v1/models`
  - `GET  /v1/models/{model}`
  - `POST /v1/chat/completions`
  - `POST /v1/embeddings`
  - `POST /v1/rerank`
- [ ] FR-2: `/v1/models` 및 `/v1/models/{model}`은 `infer.yaml`의 정적 모델 레지스트리를 OpenAI `Model` 스키마 (`{id, object:'model', created, owned_by}`)로 반환한다.
- [ ] FR-3: `POST /v1/embeddings`는 OpenAI 포맷 (`{model, input, encoding_format?, dimensions?}`) 요청을 받아 `@pleaseai/infer-tei` `TeiManager`로 라우팅하고 OpenAI `Embedding` 응답 (`{object:'list', data:[{embedding, index, object:'embedding'}], model, usage}`)을 반환한다. 문자열 및 배열 input 모두 지원.
- [ ] FR-4: `POST /v1/rerank`는 Cohere `/v2/rerank` 호환 포맷 (`{model, query, documents, top_n?, return_documents?}`) 요청을 받아 TEI rerank 호출 후 `{results:[{index, relevance_score, document?}], model, usage}`로 반환한다.
- [ ] FR-5: `POST /v1/chat/completions`는 라우트만 등록하고 OpenAI 스타일 501 에러(`{error:{message:'chat backend not implemented', type:'not_implemented_error', code:'backend_unavailable'}}`)를 반환한다. (후속 트랙에서 구현)
- [ ] FR-6: 모든 에러 응답은 OpenAI 포맷 `{error:{message, type, param?, code}}`과 표준 HTTP 상태 코드(400/401/404/422/429/500/501)를 따른다.
- [ ] FR-7: 설정 파일(`infer.yaml`) 스키마를 확장한다. 최소 필드:
  - `server.port` (number, default 3141)
  - `server.host` (string, default '127.0.0.1')
  - `auth.token` (string, optional — 설정 시 모든 요청에 Bearer 검증 적용, 미설정 시 auth off)
  - `models` (array of `{id, type:'embedding'|'rerank'|'chat', backend:'tei'|'llama', repo_id, ...backend_opts}`)
- [ ] FR-8: `auth.token`이 설정된 경우 `Authorization: Bearer <token>` 헤더 검증. 헤더 누락/토큰 불일치 시 401 + OpenAI 에러.
- [ ] FR-9: 모델 타입과 엔드포인트 불일치 시 400 반환 (예: `type:'embedding'` 모델을 `/v1/rerank`에 요청).
- [ ] FR-10: `models`에 등록되지 않은 model id 요청 시 404 + OpenAI 에러(`type:'invalid_request_error', code:'model_not_found'`).
- [ ] FR-11: `bun infer start` 명령으로 서버를 시작한다 (기존 CLI 스켈레톤 확장).

### Non-functional Requirements

- [ ] NFR-1: 라우트 핸들러는 하위 레이어(@pleaseai/infer-tei 등)만 의존하며 `Bun.spawn()`을 직접 호출하지 않는다 (ARCHITECTURE.md 불변항 준수).
- [ ] NFR-2: 테스트 커버리지 >80% (Hono 핸들러, 라우팅 로직, 스키마 검증, 인증 미들웨어).
- [ ] NFR-3: TEI 콜드 스타트 중 요청은 큐잉(reject하지 않음). 기존 TeiManager health-check 정책 재사용.
- [ ] NFR-4: OpenAI Node SDK v4+, `@ai-sdk/openai-compatible` 최신 버전, `curl` 세 클라이언트에서 각 엔드포인트 호출 성공해야 한다 (채팅 제외).

## Acceptance Criteria

- [ ] AC-1: `openai` 패키지(TS)로 `client.models.list()`, `client.models.retrieve(id)`, `client.embeddings.create({model, input})`를 호출하면 제대로 동작한다 (설정에 등록된 모델 기준).
- [ ] AC-2: `@ai-sdk/openai-compatible`로 `embed`/`embedMany`를 호출하면 TEI 백엔드를 통해 임베딩이 반환된다.
- [ ] AC-3: Cohere SDK 또는 동등 요청 shape로 `/v1/rerank`을 호출하면 `relevance_score` 내림차순 결과를 받는다.
- [ ] AC-4: `client.chat.completions.create()` 호출 시 501 상태 코드와 OpenAI 포맷 에러를 받는다.
- [ ] AC-5: `auth.token` 설정된 서버에 Authorization 헤더 없이 요청 시 401 반환, 올바른 토큰으로는 정상 응답.
- [ ] AC-6: `bun infer start --port 3141` 명령으로 서버 시작과 엔드포인트 접근 가능.
- [ ] AC-7: `bun test` 통과, 커버리지 >80%.

## Out of Scope

- llama.cpp 채팅 백엔드 구현 (`packages/llama` 신설, chat 실제 동작) — 후속 트랙
- Streaming SSE 동작 구현 (chat 구현 시 함께 설계)
- Tool calls / structured outputs / vision attachments (chat 구현 의존)
- Image generation (`/v1/images/generations`)
- BYOK, provider fallback, prompt caching (Vercel 고유 기능)
- Rate limiting, observability/metrics 대시보드
- Hot-reload of `infer.yaml` (매 재시작 필요)
- Multi-tenant API key 관리 (단일 토큰만 지원)

## Assumptions

- `@pleaseai/infer-tei` `TeiManager`는 이미 embedding/rerank API를 제공하며 이번 트랙에서 그대로 재사용한다 (변경 불필요).
- 설정 파일 이름은 `infer.yaml` 고정. 로더/파서는 이번 트랙에서 구현 (아직 없음).
- `chat` 타입 모델이 `models`에 존재해도 현재는 모두 501 반환 (FR-5).
- 기존 `packages/server/src/index.ts` 스켈레톤을 이 트랙에서 실제 서버 진입점으로 확장한다.
- TEI 프로세스는 첫 요청 시 동적 spawn되며, 레지스트리 등록과 동시에 자동 로드되지는 않는다 (lazy).
