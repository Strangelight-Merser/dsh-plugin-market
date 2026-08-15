# DSH Plugin Market

A small plugin market built into DeepSeek Harness. Discover open-source DSH
plugins, install them into the Web profile, and enable, disable, or uninstall
market-managed plugins without editing configuration files.

> [!IMPORTANT]
> This is an independent community project and is not affiliated with or
> endorsed by DeepSeek. Third-party plugins run with your user permissions and
> may read local files or credentials and access the network. Review the exact
> source shown before installation.

Version `0.4.0` targets exactly `@deepseek-ai/dsh@0.1.0-rc.6` and the `web`
profile.

## Highlights

- Pulls the maintained awesome-dsh-plugin catalog and GitHub's `dsh-plugin`
  topic on startup, every six hours, and on demand.
- Searches hundreds of entries and sorts them by GitHub stars or recent
  activity.
- Preflights the package manifest before installation, then shows the exact npm
  version or GitHub commit for confirmation.
- Installs with dependency scripts disabled, pins the selected source, enables
  the plugin by default, and rolls back profile metadata on failure.
- Keeps verification separate from discovery. A community listing is never
  presented as a security review.
- Manages only plugins installed through the market, keeping the interface
  small and predictable.

## Install

There is no public release yet. For local development:

```bash
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile web add --save-prod --save-exact --ignore-scripts \
  "file:$(pwd)"
dsh web
```

Open **Settings → 插件市场**.

Once a GitHub release is published, download its `.tgz` asset and install that
exact artifact instead of a moving branch:

```bash
dsh plugin --profile web add --save-prod --save-exact --ignore-scripts \
  ./dsh-plugin-market-0.4.0.tgz
```

## How installation works

1. Select **安装**.
2. The host resolves and validates the package manifest without changing the
   profile.
3. Review the package name, exact version or commit, license, and trust state.
4. Select **安装并启用**.
5. Restart the DSH Web process to load the changed plugin set.

DSH rc.6 caches client package metadata for the process lifetime. Safe,
general-purpose hot swapping is therefore not claimed: lifecycle changes are
transactional, but runtime code changes take effect after a Web restart.

## Catalog and trust

The packaged snapshot is an offline fallback. Live discovery can update names,
descriptions, stars, timestamps, licenses, and install locators, but it cannot
promote an entry to **verified**. Verification comes only from reviewed evidence
in `data/verified-overrides.json`.

The install button is an entry to a preflight, not a compatibility guarantee.
Repositories that do not expose a DSH bundle manifest or host entrypoint are
rejected before profile mutation. See [DATA_SOURCES.md](DATA_SOURCES.md) for
provenance and license boundaries.

Runtime refresh options:

```bash
DSH_MARKET_GITHUB_PAGES=1 GITHUB_TOKEN=... dsh web
```

`GITHUB_TOKEN` is optional and only increases GitHub API capacity. To rebuild
the bundled fallback:

```bash
DSH_GITHUB_PAGES=10 GITHUB_TOKEN=... pnpm registry:refresh
```

GitHub repository search returns at most 1,000 results for a query. “All” means
all entries returned by the declared sources within their API limits, not every
repository on the internet.

## Development

Requires Node.js `22.19+` or `24+`, pnpm `11.5.1`, and DSH
`0.1.0-rc.6` on `PATH` for contract tests.

```bash
pnpm typecheck
pnpm test
pnpm test:contract
pnpm build
npm pack --dry-run
```

The contract suite creates a disposable `DSH_HOME`; it does not modify the
user's real profile. Pull requests run the same checks on Linux and macOS.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and report
security issues through the process in [SECURITY.md](SECURITY.md).
