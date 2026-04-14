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

현재 `packages/server`는 스켈레톤(`export {}`) 상태이며 hono v4 의존성만 설치되어 있다. `@infer-please/tei`의 `TeiManager.ensureRunning(modelId)`가 동적 프로세스 스폰/헬스 체크/아이들 타이머를 이미 처리하고, `TeiClient`가 baseUrl을 받아 embed/rerank를 호출한다. 이번 트랙은 (1) 설정 로더, (2) Hono 서버 부트스트랩, (3) OpenAI/Cohere 포맷 투 방향 번역, (4) 라우트/미들웨어, (5) CLI start 명령을 추가한다. 주의: TEI 자체 rerank 응답은 `score` 필드를 쓰므로 Cohere의 `relevance_score`로 재매핑해야 한다.

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
- `index.ts` — CLI 진입점 (`infer-please start`)

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

- [x] T001 [P] Install deps (`yaml`, `zod`, `@hono/zod-validator`; devDep `@infer-please/tei` workspace, `openai`, `@ai-sdk/openai-compatible`, `ai`) (file: packages/server/package.json)
- [x] T002 Config schema + YAML loader (file: packages/server/src/config.ts) (depends on T001)
- [x] T003 [P] OpenAI-format error response helper (file: packages/server/src/errors.ts)
- [x] T004 Auth middleware — Bearer 검증 (file: packages/server/src/middleware/auth.ts) (depends on T003)
- [x] T005 Hono app factory + global error handler (file: packages/server/src/server.ts) (depends on T002, T003, T004)
- [x] T006 [P] Model registry — lookup, list, type-validate (file: packages/server/src/registry.ts) (depends on T002)
- [ ] T007 GET /v1/models, GET /v1/models/{id} (file: packages/server/src/routes/models.ts) (depends on T005, T006)
- [ ] T008 [P] Embedding translators (OpenAI ↔ TEI) (file: packages/server/src/translators/embeddings.ts) (depends on T001)
- [ ] T009 POST /v1/embeddings (file: packages/server/src/routes/embeddings.ts) (depends on T005, T006, T008)
- [ ] T010 [P] Rerank translators (Cohere ↔ TEI; score → relevance_score 재매핑) (file: packages/server/src/translators/rerank.ts) (depends on T001)
- [ ] T011 POST /v1/rerank (file: packages/server/src/routes/rerank.ts) (depends on T005, T006, T010)
- [ ] T012 POST /v1/chat/completions — 501 stub (file: packages/server/src/routes/chat.ts) (depends on T005)
- [ ] T013 CLI `infer-please start [--port] [--config]` 진입점 (file: packages/server/src/index.ts) (depends on T005, T007, T009, T011, T012)
- [ ] T014 통합 테스트 — OpenAI Node SDK + @ai-sdk/openai-compatible + curl (file: packages/server/src/integration.test.ts) (depends on T013)
- [ ] T015 ARCHITECTURE.md 업데이트 (server 서브시스템 레이어 문서화) + packages/server/README.md 작성 (file: ARCHITECTURE.md, packages/server/README.md) (depends on T013)

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
  1. `bun infer-please start --port 3141`
  2. `curl http://localhost:3141/v1/models` → 등록 모델 목록
  3. OpenAI SDK로 `embeddings.create` 성공
  4. Cohere shape로 `/v1/rerank` 호출 → `relevance_score` 내림차순 응답
  5. `chat.completions.create` → 501 + OpenAI 에러

## Progress

(empty — /please:implement가 업데이트)

## Decision Log

- 2026-04-14: 스키마 검증으로 **zod** + `@hono/zod-validator` 선택 (Hono 생태계 표준, 이미 다른 PassionFactory 프로젝트에서 활용 중)
- 2026-04-14: YAML 파서는 **yaml** 패키지 채택 (modern, ESM, type-safe; js-yaml 대비 우위)
- 2026-04-14: 채팅 라우트는 등록만 하고 501 반환 — 계약 표면을 먼저 확정하여 OpenAI 클라이언트가 조기에 접근 가능함
- 2026-04-14: TEI rerank 자체 포맷 대신 Cohere 호환 포맷 노출 — LangChain/LlamaIndex 호환성

## Surprises & Discoveries

(empty — 구현 중 기록)
