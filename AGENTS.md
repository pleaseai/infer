<!-- pleaseai-code-style:start -->
# PleaseAI Code Style

These rules are managed by `@pleaseai/code-style`. Run `pleaseai-code-style update`
to refresh this block. Do not edit between the marker comments — your changes
will be overwritten.

- Formatter: `@pleaseai/eslint-config` (wraps `@antfu/eslint-config`)
- No semicolons, single quotes, 2-space indent, trailing commas, LF line endings
- ESM only — never emit `require`/`module.exports`
- TypeScript: `strict: true`, prefer `type` over `interface`, no implicit `any`
- Prefer named exports, early returns, `async`/`await`, optional chaining
- File size target: ≤ 500 lines; colocate `*.test.ts` with the source
- Conventional Commits for all commit messages

For the full rules (what an AI coding assistant needs to know before writing code),
read `node_modules/@pleaseai/code-style/rules.md`.
<!-- pleaseai-code-style:end -->
