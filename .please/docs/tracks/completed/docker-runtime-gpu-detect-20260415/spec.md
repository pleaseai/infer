---
product_spec_domain: runtime/docker
---

# Docker Runtime + GPU Auto-Detect (TEI)

> Track: docker-runtime-gpu-detect-20260415

## Overview

infer 런타임이 현재는 `$PATH`의 네이티브 `text-embeddings-router` 바이너리로만 TEI backend를 실행한다. 이번 트랙은 **Docker 컨테이너로 TEI를 실행하는 선택지**를 프로덕션 경로에 정식 도입하고, **호스트 환경(GPU compute capability, arch)을 자동 감지해 적절한 TEI 공식 이미지 variant를 선택**하는 기능을 추가한다.

기본 runtime은 `auto`로, (1) Docker 설치/동작 여부 → (2) GPU 조회(compute capability 기반 full mapping) → (3) native fallback 순으로 결정한다. 사용자는 `infer.yaml`에서 runtime 모드, 이미지 전체, 또는 태그만 override할 수 있다. E2E 테스트가 이미 사용하는 `dockerSpawnFn` 패턴을 production 경로에 통합한다.

## Requirements

### Functional Requirements

- [ ] FR-1: `infer.yaml`에 `tei` 섹션과 `runtime` 필드 추가 — 값: `native | docker | auto` (**기본값: `auto`**)
- [ ] FR-2: `tei.image` (전체 이미지 reference override) 및 `tei.imageTag` (TEI 버전만 override, 기본값 `1.9`) 설정 지원
- [ ] FR-3: `runtime: auto` 모드 동작 — (a) `docker info` 성공 여부 확인 → (b) 실패 시 native로 fallback, (c) 성공 시 GPU 자동 감지 수행
- [ ] FR-4: GPU 자동 감지 — `nvidia-smi --query-gpu=compute_cap --format=csv,noheader`로 compute capability 조회 후 variant 매핑:
  - 7.5 → `turing-{ver}` (experimental, 로그 경고)
  - 8.0 → `{ver}` (Ampere 기본)
  - 8.6 → `86-{ver}`
  - 8.9 → `89-{ver}` (Ada Lovelace)
  - 9.0 → `hopper-{ver}`
  - 10.0 → `100-{ver}` (experimental, 로그 경고)
  - 12.0 → `120-{ver}` (experimental, 로그 경고)
  - 12.1 → `121-{ver}` (experimental, 로그 경고)
- [ ] FR-5: GPU 없음/조회 실패 시 arch 기반 CPU fallback — `linux/x64` → `cpu-{ver}`, `darwin/arm64` 또는 `linux/arm64` → `cpu-arm64-{ver}` (Node/Bun `process.arch` 값 기준; 그 외 arch는 `unknown` → CPU x64 variant로 fallback하지 않고 명시적으로 `unknown` 처리)
- [ ] FR-6: Volta(7.0), 지원 불가 compute cap 감지 시 명확한 에러 메시지와 함께 CPU fallback
- [ ] FR-7: `runtime: docker` 모드에서 Docker 미설치/미동작 시 fast-fail with 액션 가능한 에러 ("Docker not available — install Docker Desktop or set `tei.runtime: native`")
- [ ] FR-8: `TeiManager`에 Docker spawn 경로 노출 — 기존 DI 슬롯(`spawnFn`, `findBinary`)을 production에서 `DockerSpawn` 구현체로 주입 가능하도록 factory (`createTeiManager`)에 `runtime` 파라미터 추가
- [ ] FR-9: Docker 모드에서 컨테이너 포트 80을 호스트 할당 포트로 매핑, HF cache 볼륨 마운트(`~/.cache/huggingface:/data`, `HF_HOME` override 존중)
- [ ] FR-10: Docker 모드에서 experimental variant 사용 시 첫 spawn 시 1회 `console.warn` ("Using experimental TEI image `{tag}` for compute capability {X.Y}")
- [ ] FR-11: `infer start` 시작 시 resolve된 runtime/image 정보를 stdout에 출력 (예: `tei: docker ghcr.io/.../text-embeddings-inference:89-1.9`)

### Non-functional Requirements

- [ ] NFR-1: Docker 감지 로직은 런타임 시작 시 1회만 수행 (매 spawn마다 재감지 금지)
- [ ] NFR-2: `docker info`/`nvidia-smi` 호출은 각각 5초 타임아웃
- [ ] NFR-3: 단위 테스트는 `spawnFn`, `dockerInfoFn`, `gpuDetectFn`을 DI로 주입 가능해야 하며 실제 docker/nvidia-smi 호출 없이 전 조합(compute cap × arch × docker 유무) 검증 가능

## Acceptance Criteria

- [ ] AC-1: `infer.yaml` 없이 `infer start` 실행 시 auto 모드로 동작 — Docker 가용 시 Docker 모드, 불가 시 native로 자동 fallback (로그에 선택 결과 출력)
- [ ] AC-2: `tei.runtime: auto` + Docker 있음 + NVIDIA GPU (compute cap 8.9) 환경에서 `89-1.9` 이미지가 spawn됨
- [ ] AC-3: `tei.runtime: auto` + Docker 있음 + GPU 없음 + x86_64 환경에서 `cpu-1.9` 이미지가 spawn됨
- [ ] AC-4: `tei.runtime: auto` + Docker 있음 + Apple Silicon(darwin/arm64) 환경에서 `cpu-arm64-1.9` 이미지가 spawn됨
- [ ] AC-5: `tei.runtime: auto` + Docker 없음 환경에서 native 바이너리로 fallback, 로그에 fallback 사유 기록
- [ ] AC-6: `tei.runtime: docker` + Docker 없음 환경에서 시작 시점에 fast-fail (프로세스 종료)
- [ ] AC-7: `tei.image: ghcr.io/huggingface/text-embeddings-inference@sha256:...` override가 auto-detect를 우회하고 그대로 사용됨
- [ ] AC-8: `tei.imageTag: 1.8` 설정 시 variant 선택은 그대로지만 태그만 `1.8` 기반으로 resolve (예: `89-1.8`)
- [ ] AC-9: Experimental variant (turing/Blackwell) 선택 시 `console.warn` 출력 후 정상 spawn
- [ ] AC-10: Docker 모드에서 idle timeout, crash recovery, health check 등 기존 TeiManager lifecycle이 모두 native 모드와 동일하게 동작
- [ ] AC-11: 단위 테스트 coverage — `gpu-detect.ts`, `docker-spawn.ts`(production), `image-resolver.ts` 모듈 각각 >80%
- [ ] AC-12: E2E 테스트 파일(`packages/server/test/e2e/docker-spawn.ts`)의 로직이 production `docker-spawn` 구현으로 대체·재사용되어 중복 제거

## Out of Scope

- llama.cpp(`llama-server`) Docker화 — 이번 트랙은 TEI 전용, llama는 별도 트랙
- `docker pull` 사전 수행, 다운로드 진행률 UI — 첫 run 시 Docker가 자동 pull하도록 위임
- NVIDIA Container Toolkit 자동 설치/검증 — 미설치 시 에러 메시지만 전달
- HF cache 커스텀 경로, 다중 볼륨 마운트 — 기본 `~/.cache/huggingface` + `HF_HOME` 환경변수만 지원
- ROCm/AMD GPU, Vulkan 지원 — TEI 공식 이미지에 없음
- Windows 네이티브 경로 — WSL2는 Linux로 처리
- `--gpus all`/`--gpus device=N` 세밀한 GPU 리소스 제어 — auto 감지된 첫 번째 GPU로 `--gpus all` 고정
- 이미지 signature verification(cosign 등)

## Assumptions

- 기본 `tei.runtime` 값은 **`auto`**로 설정 — Docker가 감지되면 자동 활용하고, 미감지 시 native로 fallback한다. 하위 호환성은 보장하지 않으며, native 고정을 원하는 사용자는 `tei.runtime: native`를 명시해야 한다.
- 기본 TEI 버전은 **`1.9`**로 pin하며, 업그레이드는 별도 PR로 관리한다.
- `nvidia-smi`가 존재하지만 여러 GPU가 감지될 경우 첫 번째 GPU의 compute capability 기준으로 variant 선택한다 (mixed-GPU는 OOS).
- Apple Silicon에서는 공식 metal TEI 이미지가 없으므로 `cpu-arm64` 이미지가 최선의 선택이며, GPU 가속 원하면 사용자가 native(`text-embeddings-router`)로 전환해야 한다 (로그에서 안내).
- `configSchema`의 `tei` 섹션은 새로 도입되며 기존 `infer.yaml` (tei 섹션 없음)은 모두 기본값(`runtime: auto`)으로 작동한다.
- E2E의 `TEI_IMAGE` 상수는 production의 동일한 image-resolver가 `runtime: docker`, `imageTag: 1.9` 환경에서 resolve하는 `cpu` 또는 `cpu-arm64` variant digest와 일치해야 한다 (테스트와 production 간 이미지 일관성).
