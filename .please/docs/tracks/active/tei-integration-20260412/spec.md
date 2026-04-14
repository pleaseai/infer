---
product_spec_domain: inference/tei
---

# TEI 연동

> Track: tei-integration-20260412

## Overview

TEI(Text Embeddings Inference) 바이너리를 Bun.spawn()으로 관리하여 embedding과 reranking을 지원하는 코어 패키지(`@pleaseai/infer-tei`)와 Vercel AI SDK provider(`@pleaseai/infer-ai-sdk`)를 구현한다.

사용자는 모델명만 지정하면 TEI 프로세스가 자동으로 시작되고, idle timeout 후 자동 종료된다. AI SDK의 `embed()` 함수로 즉시 사용 가능하다.

## Architecture

```
┌─────────────────────┐
│ @pleaseai/infer-ai-sdk │  AI SDK EmbeddingModel adapter
└──────────┬──────────┘
           │
┌──────────┴──────────┐
│ @pleaseai/infer-tei    │  TEI Manager + API Client
│  - Bun.spawn()       │
│  - health check      │
│  - idle timeout      │
│  - port pool         │
└──────────┬──────────┘
           │ HTTP (localhost)
┌──────────┴──────────┐
│ TEI binary           │  text-embeddings-router
│ (외부 프로세스)       │  (Homebrew / Docker)
└─────────────────────┘
```

## Requirements

### Functional Requirements

#### packages/tei (`@pleaseai/infer-tei`)

- [ ] FR-1: TEI 바이너리(`text-embeddings-router`)를 $PATH에서 탐색하고, 없으면 설치 안내와 함께 에러를 발생시킨다
- [ ] FR-2: 모델명을 지정하여 TEI 프로세스를 Bun.spawn()으로 시작한다 (모델당 1개 프로세스)
- [ ] FR-3: spawn 후 /health 엔드포인트를 polling하여 TEI가 ready 상태가 될 때까지 대기한다 (timeout 포함)
- [ ] FR-4: TEI 시작 중 들어오는 요청을 큐에 넣고 ready 후 처리한다
- [ ] FR-5: 여러 모델 동시 실행을 위한 동적 포트 할당 (범위: 8080-8099)
- [ ] FR-6: 일정 시간(기본 300초) 요청이 없으면 TEI 프로세스를 자동 종료하고 포트를 회수한다
- [ ] FR-7: 프로세스 비정상 종료(crash) 시 다음 요청에서 자동 재시작한다
- [ ] FR-8: TEI HTTP API를 호출하여 embedding 결과를 반환한다 (POST /embed)
- [ ] FR-9: TEI HTTP API를 호출하여 reranking 결과를 반환한다 (POST /rerank)
- [ ] FR-10: 모든 활성 TEI 프로세스를 조회하고 특정 모델의 프로세스를 수동 종료할 수 있다

#### packages/ai-sdk (`@pleaseai/infer-ai-sdk`)

- [ ] FR-11: Vercel AI SDK의 EmbeddingModel 인터페이스를 구현하여 `embed()` 함수로 사용 가능하다
- [ ] FR-12: `createInferPlease()` provider factory를 제공하여 모델명으로 접근한다

### Non-functional Requirements

- [ ] NFR-1: TEI cold start 목표: ~1초 (경량 모델 기준)
- [ ] NFR-2: 단위 테스트 커버리지 80% 이상 (Bun.spawn mock 기반)
- [ ] NFR-3: 외부 바이너리를 번들하거나 다운로드하지 않는다

## Acceptance Criteria

- [ ] AC-1: `@pleaseai/infer-tei`로 TEI 프로세스를 시작하고 embedding 결과를 받을 수 있다
- [ ] AC-2: `@pleaseai/infer-ai-sdk`의 `embed()` 함수로 텍스트 임베딩을 수행할 수 있다
- [ ] AC-3: idle timeout 후 TEI 프로세스가 자동 종료되고, 다음 요청에서 자동 재시작된다
- [ ] AC-4: text-embeddings-router가 설치되지 않은 환경에서 명확한 에러 메시지가 표시된다
- [ ] AC-5: 단위 테스트가 80% 이상 커버리지를 달성한다

## Out of Scope

- HTTP 서버 (Hono REST API) — 별도 track
- llama.cpp / chat 기능 — 별도 track
- Transformers.js 백엔드
- oRPC / 캐시 레이어
- TEI 바이너리 자동 설치 / 다운로드
- 설정 파일(infer.yaml) 지원 — 별도 track

## Assumptions

- TEI 바이너리(`text-embeddings-router`)가 $PATH에 설치되어 있다
- 모델은 HuggingFace Hub에서 TEI가 자동 다운로드한다 (infer-please가 관리하지 않음)
- macOS (Apple Silicon) + Linux 환경을 지원한다
- Bun runtime을 사용한다
