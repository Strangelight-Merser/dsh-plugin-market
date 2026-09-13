# DSH 0.1.5 adaptation — 2026-09-12

The 0.7.0 source and release package target DSH 0.1.5-rc.1 and 0.1.5-rc.2.
At verification time, the official npm package's `latest` tag was rc.1 and
`next` was rc.2. The upstream releases are listed at
<https://github.com/deepseek-ai/deepseek-harness/releases>.

## Changes and evidence

- Reproduced lifecycle failure on rc.1: the old guard rejected it with
  `unsupported DSH "0.1.5-rc.1"; expected 0.1.0-rc.6`.
- Replaced the retired client-runtime manifest reference with the current
  UI renderer and settings shell. Contract tests verify that the published
  market's declared client dependencies exist in the real DSH boot manifest
  and that its client bundle is served.
- Updated Cordis to 4.0.2, matching the current host.
- Found that exact routes registered through `webServer` bypass the
  Connection-owned `/api` prefix handler. All six market routes now call
  the official `connection.requestRejection()` before dispatch. Tests check
  unauthenticated 401 responses, authenticated cross-origin 403 responses,
  and normal requests after the launch-token exchange.
- Retained original versions in registry evidence. The historical
  dsh-find-plugin 0.3.6 record still targets DSH 0.1.0-rc.6; it is not
  relabeled as newly verified. That fixed source remains unavailable for
  installation until new evidence exists. Historical evidence no longer
  prevents parsing the rest of the registry.

## Verification

Performed locally on macOS, Node 26.5.0, pnpm 11.5.1:

| Check | Result |
| --- | --- |
| Type checking and production build | Passed |
| Unit tests | 73 passed across 15 files |
| Real isolated lifecycle/Web contracts, DSH rc.1 | 4 passed |
| Real isolated lifecycle/Web contracts, DSH rc.2 | 4 passed |
| Production dependency audit | No known vulnerabilities |
| Package inspection | 43 files; host/client/docs/registry bytes match; packaged manifest checked |

Each contract run uses a temporary DSH_HOME. The lifecycle checks cover
preview rejection, artifact-failure rollback, installation, disable-retain,
re-enable, and uninstall. The Web check installs the real packed market,
loads its boot manifest and client bundle, disables and re-enables a fixture
through the HTTP API, then requests one restart. It confirms an unchanged
runtime before the request, a new process/runtime afterward, an empty pending
queue, retained enabled state, a still-valid browser cookie, and HTTP 409 for
a further restart without pending changes. Both process generations are
terminated during cleanup.

Browser inspection of the final package on rc.2 confirmed Settings → 插件市场,
the 3,753-entry online catalog, search filtering, and the install preview with
an exact package reference. The preview was cancelled. No browser errors were
recorded for the final load. Installed host/client bytes were also compared
with the final build; this catches pnpm retaining an earlier tarball installed
under the same local path and version.

CI runs both supported versions under each existing Node 22 Linux/macOS job.
This report records the local verification; release CI results are recorded
in the [v0.7.0 release notes](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/tag/v0.7.0).
The user's normal Web profile was not used for these tests.

## Release package

`dsh-plugin-market-0.7.0.tgz`

SHA-256: `35c5d767f127c63c3e92a7add520cc6e07c5f6ec64a587f0d488b6577c4c8d28`

pnpm removes `packageManager` and the `prepack` script from the packed
manifest. All remaining manifest fields match the source package.json.

Install from the project directory:

```sh
dsh plugin --profile web add --ignore-scripts "$PWD/dsh-plugin-market-0.7.0.tgz"
```

Restart DSH Web, open its printed authenticated URL, and select 插件市场 in
Settings. See README.md for the complete source-build instructions.
