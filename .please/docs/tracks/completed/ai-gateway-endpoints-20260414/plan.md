# Plan: OpenAI-Compatible HTTP Gateway Endpoints

> Track: ai-gateway-endpoints-20260414
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: ai-gateway-endpoints-20260414
- **Issue**: #3
- **Created**: 2026-04-14
- **Approach**: Hono 서버 + 수직 슬라이스 (설정 → 부트스트랩 → models → embeddings → rerank → chat 501 → CLI → 통합테스트)

## Purpose

Vercel AI Gateway 수준의 OpenAI 호환 HTTP API를 구현하여, infer-please를 임베딩/리랭킹의 "로컬 drop-in OpenAI gateway"로 완성한다. 기존 OpenAI 클라이언트가 baseURL 변경만으로 동작해야 하며, 채팅은 후속 트랙에 위임한다 (501 스텁).

## Context

현재 `packages/server`는 스켈레톤(`export {}`) 상태이며 hono v4 의존성만 설치되어 있다. `@pleaseai/infer-tei`의 `TeiManager.ensureRunning(modelId)`가 동적 프로세스 스폰/헬스 체크/아이들 타이머를 이미 처리하고, `TeiClient`가 baseUrl을 받아 embed/rerank를 호출한다. 이번 트랙은 (1) 설정 로더, (2) Hono 서버 부트스트랩, (3) OpenAI/Cohere 포맷 투 방향 번역, (4) 라우트/미들웨어, (5) CLI start 명령을 추가한다. 주의: TEI 자체 rerank 응답은 `score` 필드를 쓰므로 Cohere의 `relevance_score`로 재매핑해야 한다.

## Architecture Decision

**Hono + zod 조합**을 채택. Hono는 이미 의존성으로 있으며 Bun-native이고, `@hono/zod-validator`로 요청 스키마 검증을 선언적으로 처리한다. YAML 파서는 modern type-safe `yaml` 패키지 사용.

**레이어 분리**:

- `config.ts` — yaml 로더 + zod 스키마 (설정 검증)
- `registry.ts` — 설정의 models 배열을 랩어 lookup/type-check
- `errors.ts` — OpenAI 포맷 에러 응답 빌더 (단일 파일)
- `middleware/` — `auth` (Bearer), `errorHandler` (Hono onError)
- `translators/` — OpenAI/Cohere ↔ TEI 요청·응답 변환
- `routes/` — `models`, `embeddings`, `rerank`, `chat` (한 파일당 한 엔드포인트 그룹)
- `server.ts` — Hono app factory (라우트 조립, 미들웨어 와이어링, 의존성 주입)
- `index.ts` — CLI 진입점 (`infer start`)

**의존성 주입**: `createApp({ teiManager, registry, authToken? })` 패턴 — 테스트에서 TeiManager를 mock하기 쉬울 것.

## Architecture Diagram

```
HTTP Client (OpenAI SDK / AI SDK / curl)
    ↓ baseURL=:3141
Hono App (server.ts)
  ├─ errorHandler middleware  → OpenAI-format error
  ├─ auth middleware          → Bearer 검증 (설정된 경우)
  └─ routes
      ├─ GET  /v1/models        → registry.list()
      ├─ GET  /v1/models/{id}   → registry.get(id)
      ├─ POST /v1/embeddings    → translators.openai→tei → ensureRunning → TeiClient.embed → translators.tei→openai
      ├─ POST /v1/rerank        → translators.cohere→tei → ensureRunning → TeiClient.rerank → translators.tei→cohere
      └─ POST /v1/chat/...     → 501 (stub)
```

## Tasks

- [x] T001 [P] Install deps (`yaml`, `zod`, `@hono/zod-validator`; devDep `@pleaseai/infer-tei` workspace, `openai`, `@ai-sdk/openai-compatible`, `ai`) (file: packages/server/package.json)
- [x] T002 Config schema + YAML loader (file: packages/server/src/config.ts) (depends on T001)
- [x] T003 [P] OpenAI-format error response helper (file: packages/server/src/errors.ts)
- [x] T004 Auth middleware — Bearer 검증 (file: packages/server/src/middleware/auth.ts) (depends on T003)
- [x] T005 Hono app factory + global error handler (file: packages/server/src/server.ts) (depends on T002, T003, T004)
- [x] T006 [P] Model registry — lookup, list, type-validate (file: packages/server/src/registry.ts) (depends on T002)
- [x] T007 GET /v1/models, GET /v1/models/{id} (file: packages/server/src/routes/models.ts) (depends on T005, T006)
- [x] T008 [P] Embedding translators (OpenAI ↔ TEI) (file: packages/server/src/translators/embeddings.ts) (depends on T001)
- [x] T009 POST /v1/embeddings (file: packages/server/src/routes/embeddings.ts) (depends on T005, T006, T008)
- [x] T010 [P] Rerank translators (Cohere ↔ TEI; score → relevance_score 재매핑) (file: packages/server/src/translators/rerank.ts) (depends on T001)
- [x] T011 POST /v1/rerank (file: packages/server/src/routes/rerank.ts) (depends on T005, T006, T010)
- [x] T012 POST /v1/chat/completions — 501 stub (file: packages/server/src/routes/chat.ts) (depends on T005)
- [x] T013 CLI `infer start [--port] [--config]` 진입점 (file: packages/server/src/index.ts) (depends on T005, T007, T009, T011, T012)
- [x] T014 통합 테스트 — OpenAI Node SDK + @ai-sdk/openai-compatible + curl (file: packages/server/src/integration.test.ts) (depends on T013)
- [x] T015 ARCHITECTURE.md 업데이트 (server 서브시스템 레이어 문서화) + packages/server/README.md 작성 (file: ARCHITECTURE.md, packages/server/README.md) (depends on T013)

## Dependencies

```
T001 (deps)
  └─ T002 (config)
  └─ T003 (errors)
  └─ T008 (embed translators) [P]
  └─ T010 (rerank translators) [P]
T002 → T006 (registry)
T003 → T004 (auth)
T002, T003, T004 → T005 (server)
T005, T006 → T007 (models routes)
T005, T006, T008 → T009 (embeddings route)
T005, T006, T010 → T011 (rerank route)
T005 → T012 (chat 501)
T005, T007, T009, T011, T012 → T013 (CLI)
T013 → T014 (integration), T015 (docs)
```

## Key Files

**생성**:

- `packages/server/src/config.ts`, `errors.ts`, `registry.ts`, `server.ts`
- `packages/server/src/middleware/auth.ts`
- `packages/server/src/translators/embeddings.ts`, `rerank.ts`
- `packages/server/src/routes/{models,embeddings,rerank,chat}.ts`
- `packages/server/src/integration.test.ts`
- `packages/server/README.md`
- 대응 `*.test.ts` 파일들

**수정**:

- `packages/server/src/index.ts` (현재 스켈레톤) → CLI 진입점
- `packages/server/package.json` → 의존성 추가
- `ARCHITECTURE.md` → server 레이어 최신화

**참조 (변경 없음)**:

- `packages/tei/src/{tei-manager,tei-client,types}.ts`

## Verification

- `bun test` 통과, 커버리지 >80%
- `turbo run lint check-types test` 전체 통과
- 수동 검증:
  1. `bun infer start --port 3141`
  2. `curl http://localhost:3141/v1/models` → 등록 모델 목록
  3. OpenAI SDK로 `embeddings.create` 성공
  4. Cohere shape로 `/v1/rerank` 호출 → `relevance_score` 내림차순 응답
  5. `chat.completions.create` → 501 + OpenAI 에러

## Progress

- 2026-04-14: T001 Install deps — committed b8ca2d3
- 2026-04-14: T002 Config schema + YAML loader — 12 tests
- 2026-04-14: T003 OpenAI-format error helper — 8 tests
- 2026-04-14: T004 Bearer auth middleware — 6 tests
- 2026-04-14: T005 Hono app factory + error handler — 5 tests
- 2026-04-14: T006 Model registry — 7 tests
- 2026-04-14: T007 GET /v1/models endpoints — 5 tests
- 2026-04-14: T008 Embedding translators — 11 tests (incl. base64)
- 2026-04-14: T009 POST /v1/embeddings — 6 tests
- 2026-04-14: T010 Rerank translators — 11 tests
- 2026-04-14: T011 POST /v1/rerank — 5 tests
- 2026-04-14: T012 Chat 501 stub — 2 tests
- 2026-04-14: T013 CLI entry point — 11 tests
- 2026-04-14: T014 Integration tests — 9 tests (OpenAI SDK + AI SDK + curl)
- 2026-04-14: T015 ARCHITECTURE.md + README.md
- 2026-04-14: Review fixes — extract backends.ts, _shared.ts, TeiClient memoization, exhaustive backend switch, shutdown error surfacing, drop unused `dimensions`, comment token-estimate semantics
- **Final**: 101 tests pass; coverage 100% line / ≥78% branch on server files (>80% target met)

## Decision Log

- 2026-04-14: 스키마 검증으로 **zod** + `@hono/zod-validator` 선택 (Hono 생태계 표준, 이미 다른 PassionFactory 프로젝트에서 활용 중)
- 2026-04-14: YAML 파서는 **yaml** 패키지 채택 (modern, ESM, type-safe; js-yaml 대비 우위)
- 2026-04-14: 채팅 라우트는 등록만 하고 501 반환 — 계약 표면을 먼저 확정하여 OpenAI 클라이언트가 조기에 접근 가능함
- 2026-04-14: TEI rerank 자체 포맷 대신 Cohere 호환 포맷 노출 — LangChain/LlamaIndex 호환성

## Outcomes & Retrospective

### What Was Shipped

Single-port OpenAI-compatible HTTP gateway in `packages/server` — `/v1/models`, `/v1/embeddings` (with base64 support), `/v1/rerank` (Cohere shape), `/v1/chat/completions` (501 stub), optional Bearer auth, CLI (`infer start`). 101 tests / 0 fail / 100% line coverage on server code.

### What Went Well

- 수직 슬라이싱으로 매 커밋마다 green 상태 유지 — 실패해도 영향 범위 좁음.
- 의존성 주입 (`Backends` 인터페이스) 덕분에 `TeiManager`/`TeiClient` 없이도 라우트를 단독 테스트 가능.
- TDD 리듬이 15개 태스크에 걸쳐 일관되게 적용되었고, 통합 테스트 시점에 발견된 OpenAI SDK `encoding_format: "base64"` 이슈를 빠르게 흡수.
- `/please:review`에서 나온 Important 6건을 모두 YAGNI/DRY 원칙에 맞춰 정리 (backends.ts 추출, `_shared.ts`, 힐난 스위치, 클라이언트 메모이제이션).

### What Could Improve

- 통합 테스트에서 Bun의 `rejects.toMatchObject`가 기대대로 동작하지 않아 `try/catch` 패턴으로 우회. Bun 이슈 추적 필요.
- OpenAI SDK가 base64 encoding을 기본값으로 사용한다는 점을 사전에 파악하지 못해 중간 수정이 필요했음. 다음 트랙에서는 대상 SDK의 기본 wire 포맷을 먼저 실측.
- `estimateTokens` 프록시가 정확한 토큰 수를 반환하지 않으므로 장기적으로는 실제 tokenizer (BPE 기반) 도입 고려 대상.

### Tech Debt Created

- `estimateTokens` / `estimateRerankTokens`: `chars/4` 근사치. 정확한 usage 보고 필요 시 real tokenizer로 교체.
- `/v1/models/` (trailing slash) 동작 명세 미확정 — 현재 list 라우트에 매칭됨.
- HTTP 레벨 rate limiting (429) 및 422 (unprocessable entity) 분기 미구현 — spec FR-6에 언급됨.
- Config hot-reload 미지원 — 모델 등록 변경 시 프로세스 재시작 필요.

## Surprises & Discoveries

- **OpenAI Node SDK는 `encoding_format: "base64"`를 기본으로 보냄** — 응답에서 base64 문자열로 임베딩을 받아 클라이언트가 Float32Array로 디코딩한다. 호환을 위해 서버에서 base64 인코딩을 구현해야 했다. zod 스키마에 `'base64'` 추가, 런타임에 Float32Array → Buffer → base64.
- **`expect(promise).rejects.toMatchObject(...)`가 Bun에서 promise를 await하지 않는 듯** — 직접 `try/catch`로 잡고 `expect(err.status).toBe(...)`로 검증해야 안정적이었다. 통합 테스트 작성 시 함정.
- **Hono의 `app.fetch`는 `typeof fetch`와 시그니처가 다름** — Bun의 fetch 타입은 `preconnect` 메서드를 요구하므로 `FetchLike` 별도 타입을 정의하고 외부 SDK에 넘길 때 `as typeof fetch`로 캐스트 필요.
- **TEI rerank 응답 포맷이 Cohere와 다름** — TEI는 `score` 필드, Cohere는 `relevance_score`. 또한 TEI는 정렬 보장을 명시하지 않으므로 트랜슬레이터에서 `sort` + `top_n` 슬라이스를 항상 수행.
