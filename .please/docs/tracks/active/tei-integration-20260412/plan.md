# Plan: TEI 연동

> Track: tei-integration-20260412
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: tei-integration-20260412
- **Issue**: #1
- **Created**: 2026-04-12
- **Approach**: Clean Architecture

## Purpose

After this change, developers will be able to run local embedding and reranking inference via TEI through a simple TypeScript API or Vercel AI SDK's `embed()` function. They can verify it works by calling `embed({ model: inferPlease.textEmbeddingModel('BAAI/bge-small-en-v1.5'), value: 'hello' })` and receiving a vector response.

## Context

The infer-please project is currently a greenfield monorepo with skeleton packages. The core value proposition is managing TEI processes automatically — spawn on first request, health check until ready, idle timeout for resource cleanup. TEI exposes a REST API (POST /embed, POST /rerank, GET /health) and is started via `text-embeddings-router --model-id <model> --port <port>`. Each model requires its own TEI process on a unique port. The AI SDK integration is a thin adapter implementing `EmbeddingModelV1<string>` with a single `doEmbed()` method.

Non-goals for this track: HTTP server (Hono), llama.cpp, Transformers.js, config files, caching.

## Architecture Decision

Two packages with clear separation: `@infer-please/tei` owns all process lifecycle and TEI HTTP communication, `@infer-please/ai-sdk` is a stateless adapter that delegates to tei. The tei package is split into focused modules — TeiManager (process state machine), TeiClient (HTTP calls to TEI), PortPool (port allocation), and binary discovery. This keeps each module independently testable with clear boundaries. The Manager uses a Map<modelId, TeiProcess> where each TeiProcess tracks state (starting/ready/stopping), the spawned Bun subprocess, allocated port, and idle timer.

## Architecture Diagram

```
User Code
  │
  ├─ embed() ──► @infer-please/ai-sdk
  │                    │
  │                    ▼
  └─ direct ──► @infer-please/tei
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      TeiManager  TeiClient  PortPool
          │          │          │
          ▼          │          │
     Bun.spawn()     │          │
          │          │          │
          ▼          ▼          │
     TEI Process ◄── fetch() ◄──┘
     (port N)     (localhost:N)
```

## Tasks

- [ ] T001 [P] packages/tei 패키지 스캐폴딩 (file: packages/tei/package.json)
- [ ] T002 [P] 타입 정의 (file: packages/tei/src/types.ts)
- [ ] T003 [P] TEI 바이너리 탐색 유틸리티 (file: packages/tei/src/binary.ts)
- [ ] T004 [P] 포트 풀 관리 (file: packages/tei/src/port-pool.ts)
- [ ] T005 TEI 프로세스 매니저 — spawn, health check, idle timeout, crash recovery (file: packages/tei/src/tei-manager.ts) (depends on T002, T003, T004)
- [ ] T006 TEI HTTP 클라이언트 — embed, rerank 호출 (file: packages/tei/src/tei-client.ts) (depends on T002)
- [ ] T007 Public API — createTeiManager, embed, rerank export (file: packages/tei/src/index.ts) (depends on T005, T006)
- [ ] T008 AI SDK EmbeddingModel 구현 (file: packages/ai-sdk/src/embedding-model.ts) (depends on T007)
- [ ] T009 AI SDK provider factory — createInferPlease() (file: packages/ai-sdk/src/index.ts) (depends on T008)

## Key Files

### Create

- `packages/tei/package.json` — 패키지 설정, bun-types 의존성
- `packages/tei/tsconfig.json` — TypeScript 설정 (server 패턴 따름)
- `packages/tei/src/types.ts` — TeiProcess, EmbedRequest/Response, RerankRequest/Response 등
- `packages/tei/src/binary.ts` — which() 스타일 바이너리 탐색
- `packages/tei/src/port-pool.ts` — 포트 할당/회수 (Set 기반)
- `packages/tei/src/tei-manager.ts` — TEI 프로세스 생명주기 관리
- `packages/tei/src/tei-client.ts` — TEI REST API 호출 (fetch)
- `packages/tei/src/index.ts` — public API export

### Modify

- `packages/ai-sdk/src/index.ts` — createInferPlease() provider factory 구현
- `packages/ai-sdk/package.json` — @infer-please/tei workspace 의존성 추가

### Reuse

- `packages/ai-sdk/tsconfig.json` — 기존 tsconfig 패턴 재사용
- `packages/server/tsconfig.json` — bun-types 참조 패턴 재사용

## Verification

### Automated Tests

- [ ] binary.ts: $PATH에 바이너리 있을 때/없을 때 탐색 테스트
- [ ] port-pool.ts: 할당, 회수, 고갈 시 에러 테스트
- [ ] tei-manager.ts: spawn → health → ready 생명주기 테스트 (Bun.spawn mock)
- [ ] tei-manager.ts: idle timeout 후 프로세스 종료 테스트
- [ ] tei-manager.ts: crash 후 재시작 테스트
- [ ] tei-client.ts: embed/rerank 요청/응답 변환 테스트 (fetch mock)
- [ ] embedding-model.ts: doEmbed() 호출 → tei client 연동 테스트

### Observable Outcomes

- After `bun test --coverage`, 80% 이상 커버리지 달성
- Running `turbo run check-types` shows no type errors across all packages
- Running `turbo run lint` shows no lint errors

### Manual Testing

- [ ] text-embeddings-router 설치 후 embed() 호출하여 실제 벡터 응답 확인
- [ ] rerank() 호출하여 정렬된 결과 확인
- [ ] idle timeout 후 프로세스 종료 확인 (ps 명령)

### Acceptance Criteria Check

- [ ] AC-1: @infer-please/tei로 TEI 프로세스를 시작하고 embedding 결과를 받을 수 있다
- [ ] AC-2: @infer-please/ai-sdk의 embed() 함수로 텍스트 임베딩을 수행할 수 있다
- [ ] AC-3: idle timeout 후 TEI 프로세스가 자동 종료되고, 다음 요청에서 자동 재시작된다
- [ ] AC-4: text-embeddings-router가 설치되지 않은 환경에서 명확한 에러 메시지가 표시된다
- [ ] AC-5: 단위 테스트가 80% 이상 커버리지를 달성한다

## Decision Log

- Decision: packages/tei와 packages/ai-sdk를 분리하여 TEI 코어를 독립 사용 가능하게
  Rationale: AI SDK 없이도 TEI를 직접 사용하는 케이스 지원, 의존성 최소화
  Date/Author: 2026-04-12 / Claude
