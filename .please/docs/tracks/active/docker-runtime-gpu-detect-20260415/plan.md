# Plan: Docker Runtime + GPU Auto-Detect (TEI)

> Track: docker-runtime-gpu-detect-20260415
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: docker-runtime-gpu-detect-20260415
- **Issue**: TBD
- **Created**: 2026-04-15
- **Approach**: Pure-function resolver + DI spawn strategy (TeiManager DI 슬롯을 production으로 승격)

## Purpose

infer 런타임이 네이티브 `text-embeddings-router` 바이너리 외에 Docker 컨테이너로도 TEI를 실행할 수 있게 하고, 호스트의 GPU compute capability를 자동 감지해 적절한 공식 이미지 variant를 선택한다. 하위 호환성 무시 — 기본 runtime은 `auto`.

## Context

- `TeiManager`는 이미 `spawnFn`, `findBinary` DI 슬롯을 갖고 있으나 `createTeiManager` factory가 이를 노출하지 않음.
- E2E 테스트(`packages/server/test/e2e/docker-spawn.ts`)가 `cpu-latest` digest 하나로 하드코딩된 Docker spawn을 이미 구현 중. 로직을 production으로 승격 후 E2E는 같은 resolver를 사용하도록 재구성.
- `configSchema`에는 `tei` 섹션이 없으므로 신규 도입.
- TEI 공식 이미지 variant (ghcr.io/huggingface/text-embeddings-inference): compute capability별로 `cpu`, `cpu-arm64`, `turing`(7.5, exp), 기본(8.0), `86`, `89`, `hopper`(9.0), `100`/`120`/`121`(Blackwell, exp).

## Architecture Decision

**선택**: Pure-function resolver + DI spawn strategy

- `gpu-detect.ts`와 `image-resolver.ts`는 순수 함수로 작성 → DI 없이도 compute_cap × arch × override 전 조합 단위 테스트 가능.
- Runtime 선택은 `runtime-selector.ts`에서 서버 시작 시 1회 수행 (NFR-1). 결과는 `RuntimeResolution` 객체로 `createTeiManager`에 전달.
- `TeiManager` lifecycle 코드는 건드리지 않음 — 기존 DI 슬롯에 `DockerSpawn` 구현체를 꽂는 방식이라 idle timeout, crash recovery, health check 로직이 Docker 모드에서도 변경 없이 동작 (AC-10).
- E2E `docker-spawn.ts`는 production `packages/tei/src/runtime/docker-spawn.ts`를 import하도록 재구성 — 한 로직, 한 버전 pin (AC-12).

**기각 대안**:

- TeiManager 내부에 runtime 분기 — lifecycle 코드가 오염되고 테스트 복잡도 상승
- Docker를 별도 Manager 클래스로 분리 — 두 lifecycle 구현을 병행 관리해야 하므로 유지보수 부담 증가

## Architecture Diagram

```
infer.yaml (tei.runtime, tei.image, tei.imageTag)
        │
        ▼
┌───────────────────────────┐
│ runtime-selector.ts       │ ← docker info (1회), nvidia-smi (1회)
│  selectRuntime(config)    │
└──────────┬────────────────┘
           │ RuntimeResolution
           │ { mode: 'native'|'docker', spawnFn, findBinary, imageRef?, logLines[] }
           ▼
┌───────────────────────────┐
│ createTeiManager(opts,    │
│   runtime: Resolution)    │
└──────────┬────────────────┘
           │ DI: spawnFn / findBinary
           ▼
┌───────────────────────────┐    native: findTeiBinary + Bun.spawn
│ TeiManager (기존 로직)    │ ─► docker : dockerFindBinary + dockerSpawn
│  ensureRunning/health/idle│              └─ image = resolveTeiImage(gpu, arch, cfg)
└───────────────────────────┘
```

## Tasks

- [x] T001 [P] config 스키마에 tei 섹션 추가 (file: packages/server/src/config.ts) — `teiSchema`(runtime: `'native'|'docker'|'auto'` default `auto`, image, imageTag default `'1.9'`), `parseConfig` 확장. 검증: 기존 테스트 전 통과 + tei 섹션 없는 yaml → `runtime:'auto'` 기본값
- [x] T002 [P] config.ts tei 섹션 단위 테스트 (file: packages/server/src/config.test.ts) — runtime enum 유효/무효, 기본값, image/imageTag override, 기존 테스트 regression 확인. 커버리지 >80% (depends on T001)
- [x] T003 [P] gpu-detect 모듈 (file: packages/tei/src/runtime/gpu-detect.ts) — `detectGpu(execFn): { computeCap: string, count: number } | null`, 5초 타임아웃, nvidia-smi 결과 파싱, 실패 시 null
- [x] T004 [P] gpu-detect 단위 테스트 (file: packages/tei/src/runtime/gpu-detect.test.ts) — execFn 모킹: (a) nvidia-smi 없음 → null, (b) "8.9" 출력 → {computeCap:'8.9'}, (c) 복수 GPU → 첫 번째 사용, (d) 타임아웃 → null, (e) 에러 출력 → null (depends on T003)
- [x] T005 [P] image-resolver 모듈 (file: packages/tei/src/runtime/image-resolver.ts) — `resolveTeiImage({gpu, arch, imageTag, override}): { ref: string, isExperimental: boolean, reason: string }`. compute cap → variant 전 매핑, override 우선, arch fallback (`darwin-arm64`/`linux-arm64` → cpu-arm64, x86_64 → cpu). 순수 함수
- [x] T006 [P] image-resolver 단위 테스트 (file: packages/tei/src/runtime/image-resolver.test.ts) — 매핑 테이블 전체: 7.5 → `turing-1.9` (exp), 8.0 → `1.9`, 8.6 → `86-1.9`, 8.9 → `89-1.9`, 9.0 → `hopper-1.9`, 10.0/12.0/12.1 → exp, Volta 7.0 → cpu + reason, gpu null + darwin-arm64 → `cpu-arm64-1.9`, gpu null + linux-x64 → `cpu-1.9`, override 있으면 auto 우회. 커버리지 >80% (depends on T005)
- [x] T007 docker-spawn production 모듈 (file: packages/tei/src/runtime/docker-spawn.ts) — E2E `docker-spawn.ts`의 `dockerFindBinary`/`dockerSpawnFn`/`hasDocker` 로직을 이 파일로 이전. 이미지 reference를 인자로 받아 `--gpus all`(GPU 있을 때), `-v $HF_HOME:/data`, `-p $hostPort:80` 컨테이너 실행. `TEI_IMAGE` 상수 제거 (resolver가 주입) (depends on T005)
- [x] T008 docker-spawn 단위 테스트 (file: packages/tei/src/runtime/docker-spawn.test.ts) — `execFileSyncFn`, `spawnFn` DI 모킹. (a) `--gpus all` 포함 여부, (b) 볼륨 마운트 경로, (c) `--port 80` 컨테이너 내부 고정, (d) kill 시 docker stop 호출, (e) hasDocker 타임아웃 동작. 커버리지 >80% (depends on T007)
- [x] T009 runtime-selector 모듈 (file: packages/tei/src/runtime/runtime-selector.ts) — `selectRuntime({config, env, platform, dockerInfoFn, gpuDetectFn, findBinaryFn}): RuntimeResolution`. runtime=native → native DI, docker → docker 가용성 필수 + resolve image, auto → docker 시도 → 성공 시 GPU 감지 후 docker, 실패 시 native fallback. experimental variant 감지 시 `logLines`에 경고 추가 (depends on T003, T005, T007)
- [x] T010 runtime-selector 단위 테스트 (file: packages/tei/src/runtime/runtime-selector.test.ts) — DI 모킹으로 전 조합 검증: (a) runtime=native → findTeiBinary, (b) runtime=docker + docker 없음 → throw, (c) runtime=docker + docker 있음 → dockerSpawn + resolved image, (d) auto + docker 없음 → native, (e) auto + docker + nvidia-smi 없음 → cpu variant, (f) auto + docker + GPU cc=8.9 → 89-1.9, (g) experimental variant → warn logLine. 커버리지 >80% (depends on T009)
- [x] T011 createTeiManager 확장 (file: packages/tei/src/index.ts) — `createTeiManager`가 `{options?, runtime?: RuntimeResolution}` 받도록 변경. runtime 지정 시 resolution의 spawnFn/findBinary를 TeiManager 생성자에 전달. runtime 관련 타입 export (depends on T009)
- [x] T012 createTeiManager 단위 테스트 (file: packages/tei/src/index.test.ts) — (a) runtime 없으면 기본(native) 동작, (b) runtime.mode=docker → spawnFn/findBinary가 docker 버전으로 주입됨 확인 (mocked TeiManager) (depends on T011)
- [x] T013 server entrypoint 통합 (file: packages/server/src/index.ts) — `main()`에서 `selectRuntime(config, {platform, env})` 호출 → `createTeiManager({options, runtime})` 전달. `runtime.logLines` stdout 출력, resolve된 runtime/image를 기존 시작 배너에 추가 (depends on T001, T011)
- [x] T014 server 시작 로그 단위 테스트 (file: packages/server/src/index.test.ts) — auto/native/docker 모드별 배너 포맷 검증 (mocked selectRuntime) (depends on T013)
- [ ] T015 E2E docker-spawn.ts refactor (file: packages/server/test/e2e/docker-spawn.ts) — `dockerSpawnFn`/`dockerFindBinary`/`hasDocker`를 `@pleaseai/infer-tei/runtime`에서 재export로 축소. `TEI_IMAGE` 상수 제거, helpers.ts는 `resolveTeiImage({arch, imageTag:'1.9'})` 결과를 사용 (depends on T007, T011)
- [ ] T016 E2E 회귀 실행 확인 (file: packages/server/test/e2e/*.e2e.test.ts) — `RUN_E2E=1 bun test test/e2e`로 전 E2E suite green. 무변경 (중복 제거만 검증) (depends on T015)
- [ ] T017 README 업데이트 (file: README.md) — Configuration 섹션의 `tei.binary: text-embeddings-router # or docker` 제거, 신규 `tei.runtime: auto|native|docker`, `tei.image`, `tei.imageTag` 문서화. Roadmap의 "Docker mode" 체크 (depends on T013)
- [ ] T018 tech-stack.md 업데이트 (file: .please/docs/knowledge/tech-stack.md) — External Binaries 섹션에 Docker runtime이 정식 경로임을 반영 (depends on T013)

## Dependencies

```
T001 ─┬─► T002
      │
      └─────────────────────────────────────┐
                                             │
T003 ─► T004                                 │
                                             │
T005 ─► T006 ──► T007 ─► T008                │
                     │                       │
T003, T005, T007 ──► T009 ─► T010            │
                        │                    │
                        └─► T011 ─► T012     │
                                 │           │
                                 └─► T013 ◄──┘
                                      │
                                      ├─► T014
                                      ├─► T015 ─► T016
                                      ├─► T017
                                      └─► T018
```

Parallel clusters:

- T001/T002, T003/T004, T005/T006 — 완전 독립 병렬 가능
- T007(→T008), T009(→T010), T011(→T012) — 순차
- T013 이후 T014/T015/T017/T018 병렬 가능 (T016은 T015 대기)

## Key Files

- `packages/server/src/config.ts` (수정) — tei 섹션 스키마 추가
- `packages/tei/src/runtime/gpu-detect.ts` (신규) — nvidia-smi 래퍼
- `packages/tei/src/runtime/image-resolver.ts` (신규) — 순수 매핑 함수
- `packages/tei/src/runtime/docker-spawn.ts` (신규) — E2E 로직 production 승격
- `packages/tei/src/runtime/runtime-selector.ts` (신규) — runtime 결정 진입점
- `packages/tei/src/index.ts` (수정) — createTeiManager 확장, runtime re-export
- `packages/server/src/index.ts` (수정) — selectRuntime 호출 + 배너
- `packages/server/test/e2e/docker-spawn.ts` (수정) — production re-export로 축소
- `packages/server/test/e2e/helpers.ts` (수정) — resolver 사용
- `README.md` (수정) — config 섹션 갱신

## Verification

- Phase 완료 시: `turbo run lint check-types test` 전부 green
- E2E: `bun run test:e2e` (Docker 필요) — 기존 suites 무회귀
- 수동 검증 (T013 이후):
  1. `bun run packages/server/src/index.ts start` (설정 없음) → 배너에 resolve된 runtime/image 출력
  2. `tei.runtime: native` yaml → native 경로, 네이티브 바이너리 사용
  3. `tei.runtime: docker` yaml + Docker 미기동 → 시작 즉시 fail-fast
  4. `tei.image: ghcr.io/.../text-embeddings-inference@sha256:...` → auto-detect 건너뜀
- 커버리지 목표 >80% — gpu-detect, image-resolver, docker-spawn, runtime-selector 각각

## Progress

- 2026-04-15: T001, T002 — config.ts에 tei 섹션 스키마 (runtime enum, image, imageTag default 1.9) 추가 및 9개 단위 테스트 통과 (21/21 green)
- 2026-04-15: T003, T004 — gpu-detect.ts (nvidia-smi 래퍼, DI execFn, 5s timeout) + 7 단위 테스트 (7/7 green)
- 2026-04-15: T005, T006 — image-resolver.ts (compute cap 8종 + Volta fallback + arch-based CPU fallback + override) + 19 단위 테스트 (26/26 green)
- 2026-04-15: T007, T008 — docker-spawn.ts production (createDockerSpawn factory, hasDocker probe) + 10 단위 테스트 (36/36 runtime green)
- 2026-04-15: T009, T010 — runtime-selector.ts (auto/docker/native 분기, experimental warning) + 13 단위 테스트 (49/49 runtime green)
- 2026-04-15: T011, T012 — createTeiManager factory 확장 (2-arg signature, runtime resolution 주입) + 5 단위 테스트 (98/98 tei package green)

## Decision Log

- 2026-04-15: 하위 호환성 무시 방침 확정 → 기본 runtime `auto` 채택 (사용자 승인)
- 2026-04-15: E2E `docker-spawn.ts`를 production으로 승격하는 구조 선택 (duplicated digest pin 제거)
- 2026-04-15: Pure-function resolver 채택 — DI 없이 단위 테스트 100% 커버 가능

## Surprises & Discoveries

<!-- 구현 중 발견 사항 기록 -->
