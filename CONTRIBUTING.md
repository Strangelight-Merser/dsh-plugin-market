# Contributing

Thanks for helping keep DSH Plugin Market small, useful, and trustworthy.

## Before opening a pull request

1. Open an issue for behavior or architecture changes.
2. Keep changes focused; do not add compatibility paths for unreleased behavior.
3. Install dependencies with `pnpm install --frozen-lockfile`.
4. Run:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm test:contract
   pnpm build
   npm pack --dry-run
   ```

5. Explain the user-visible change and the validation you ran.

The contract tests require DSH `0.1.0-rc.6` on `PATH` and use a disposable
`DSH_HOME`.

## Adding plugins

General catalog additions belong in the upstream
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
project or in a repository carrying the `dsh-plugin` GitHub topic. Do not edit
the generated registry snapshot manually.

A verified override must include reproducible evidence for the exact source and
DSH version: manifest, installed artifacts, dumped configuration, and boot must
all pass. Discovery popularity is not verification evidence.

## Design principles

- Show only information that helps a user choose or manage a plugin.
- Make trust and runtime boundaries accurate and visible at decision time.
- Prefer the smallest end-to-end implementation that is easy to remove or
  reason about.
- Add tests for security, lifecycle, registry, or sorting behavior changed by
  the pull request.
