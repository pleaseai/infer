# Project Gotchas

> Known pitfalls and workarounds. Consult before starting a new track.

## Git / GitHub

### `gh issue develop --checkout`은 **원격 base branch** 기준으로 브랜치를 생성한다

`gh issue develop 123 --checkout`은 GitHub API를 호출해 origin/{default-branch} 기준으로 새 브랜치를 생성한다. 로컬 default branch에만 있고 아직 push하지 않은 커밋은 **issue branch에 포함되지 않는다**.

**Why**: GitHub 측에서 브랜치가 먼저 만들어진 뒤 로컬이 그 원격 브랜치를 checkout하는 구조 때문. 로컬 base가 앞서 있어도 reflect되지 않음.

**How to apply**:
- 트랙 문서/커밋을 로컬 default branch에 만들어 두었다면, `gh issue develop` **전에** `git push origin {default-branch}`로 먼저 올리거나
- 브랜치 생성 후 `git merge {default-branch}`로 로컬 변경을 issue branch로 가져온다.
- `/please:new-track`으로 생성한 트랙 커밋은 `/please:implement` 진입 전 default branch에 push해두는 편이 안전.
