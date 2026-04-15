---
id: SPEC-002
level: V_M
domain: runtime
feature: docker
depends: []
conflicts: []
traces: []
created_at: 2026-04-15T08:27:58Z
updated_at: 2026-04-15T08:27:58Z
source_tracks: ["docker-runtime-gpu-detect-20260415"]
---

# Docker Runtime + GPU Auto-Detect (TEI) Specification

## Purpose

Docker Runtime + GPU Auto-Detect (TEI) 관련 요구사항. infer 런타임에서 TEI backend를 native 바이너리 외에 Docker 컨테이너로 실행하고, 호스트 GPU compute capability를 자동 감지해 적절한 공식 이미지 variant를 선택한다.

## Requirements

### Requirement: tei 섹션과 runtime 필드

The system MUST provide a `tei` section in `infer.yaml` with a `runtime` field accepting `native | docker | auto` (default: `auto`).

#### Scenario: tei 섹션과 runtime 필드

- GIVEN 시스템이 정상 동작 중일 때
- WHEN `tei.runtime`이 `native|docker|auto` 중 하나로 지정된다
- THEN 해당 런타임 모드로 TEI backend가 실행된다

### Requirement: tei.image 및 tei.imageTag override

The system MUST support `tei.image` (full image reference override) and `tei.imageTag` (TEI version override, default `'1.9'`).

#### Scenario: tei.image 및 tei.imageTag override

- GIVEN 시스템이 정상 동작 중일 때
- WHEN 사용자가 `tei.image` 또는 `tei.imageTag`를 지정한다
- THEN auto-detect 결과 대신 지정된 이미지/태그가 사용된다

### Requirement: runtime=auto 모드 동작

The system MUST, in `auto` mode, check `docker info` first; on failure fall back to native; on success perform GPU auto-detection.

#### Scenario: runtime=auto 모드 동작

- GIVEN `tei.runtime: auto`
- WHEN 서버가 시작된다
- THEN Docker 가용성 확인 후 GPU 감지, 미가용 시 native fallback으로 진행된다

### Requirement: GPU compute capability → 이미지 variant 매핑

The system MUST map NVIDIA compute capability to TEI image variant: 7.5 → turing (experimental), 8.0 → default, 8.6 → 86-, 8.9 → 89-, 9.0 → hopper-, 10.0 → 100- (experimental), 12.0 → 120- (experimental), 12.1 → 121- (experimental).

#### Scenario: GPU compute capability → 이미지 variant 매핑

- GIVEN `tei.runtime: auto` 또는 `docker` 모드
- WHEN `nvidia-smi`가 compute capability를 반환한다
- THEN 매핑된 TEI 이미지 variant가 선택된다

### Requirement: arch 기반 CPU fallback

The system MUST fall back to arch-aware CPU variants when no GPU is detected: `linux/x86_64` → `cpu-{ver}`, `darwin/aarch64` or `linux/aarch64` → `cpu-arm64-{ver}`.

#### Scenario: arch 기반 CPU fallback

- GIVEN GPU가 감지되지 않는 환경
- WHEN 이미지 resolver가 동작한다
- THEN 호스트 arch에 맞는 CPU variant가 선택된다

### Requirement: 지원 불가 compute capability 처리

The system MUST explicitly handle unsupported compute capabilities (e.g., Volta 7.0) by falling back to CPU variant with a descriptive reason.

#### Scenario: 지원 불가 compute capability 처리

- GIVEN compute cap 7.0 (Volta) 또는 알 수 없는 값이 감지된다
- WHEN 이미지 resolver가 동작한다
- THEN CPU variant로 fallback되며 로그에 사유가 기록된다

### Requirement: runtime=docker fast-fail

The system MUST fast-fail with an actionable error when `tei.runtime: docker` is set but Docker is not available.

#### Scenario: runtime=docker fast-fail

- GIVEN `tei.runtime: docker`
- WHEN Docker가 설치/동작하지 않는다
- THEN 서버 시작 시점에 명확한 에러 메시지와 함께 종료된다

### Requirement: TeiManager Docker spawn 경로 노출

The system MUST expose a Docker spawn path in `TeiManager` via the existing DI slots (`spawnFn`, `findBinary`) through an extended `createTeiManager` factory accepting a runtime resolution.

#### Scenario: TeiManager Docker spawn 경로 노출

- GIVEN production 서버가 시작된다
- WHEN runtime=docker 모드가 선택된다
- THEN TeiManager가 docker spawn 구현체로 lifecycle을 동작시킨다

### Requirement: Docker 모드 포트 매핑 및 HF cache 마운트

The system MUST map container port 80 to the host port allocated by `TeiManager`, and mount the HF cache volume (`~/.cache/huggingface:/data`, respecting `HF_HOME` override).

#### Scenario: Docker 모드 포트 매핑 및 HF cache 마운트

- GIVEN runtime=docker 모드로 spawn이 수행된다
- WHEN TEI 컨테이너가 실행된다
- THEN 호스트 할당 포트가 컨테이너 80에 매핑되고 HF cache가 `/data`로 마운트된다

### Requirement: experimental variant 경고

The system MUST emit a warning once when an experimental TEI image variant (Turing or Blackwell) is selected.

#### Scenario: experimental variant 경고

- GIVEN auto/docker 모드에서 experimental variant가 선택된다
- WHEN 서버가 시작된다
- THEN 사용자에게 visible한 warning 메시지가 한 번 출력된다

### Requirement: 시작 배너에 runtime/image 출력

The system MUST print the resolved runtime mode and image reference (for Docker mode) to stdout on `infer start`.

#### Scenario: 시작 배너에 runtime/image 출력

- GIVEN `infer start`가 실행된다
- WHEN 서버가 listening 상태가 된다
- THEN 배너에 resolve된 runtime과 이미지 정보가 표시된다

## Non-functional Requirements

### Requirement: 감지 1회 수행

The system SHOULD perform Docker and GPU detection once at server startup, not on every spawn.

### Requirement: 감지 호출 타임아웃

The system SHOULD apply a 5-second timeout to `docker info` and `nvidia-smi` calls.

### Requirement: DI 기반 테스트 가능성

The system SHOULD expose injectable `spawnFn`, `dockerInfoFn`, `gpuDetectFn` so that unit tests cover the full combination matrix (compute cap × arch × docker availability) without invoking real processes.
