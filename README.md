# DSH Plugin Market

> 极简、轻量、开箱即用的 DeepSeek Harness 插件市场。

在 DSH 设置页里找插件、看完整介绍、确认来源，然后一键安装并默认启用。无需手改配置，也不会把关键词命中的普通仓库伪装成插件。

[![Release](https://img.shields.io/github/v/release/Strangelight-Merser/dsh-plugin-market?style=flat-square)](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Strangelight-Merser/dsh-plugin-market/ci.yml?branch=main&style=flat-square)](https://github.com/Strangelight-Merser/dsh-plugin-market/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Strangelight-Merser/dsh-plugin-market?style=flat-square)](LICENSE)

## 为什么好上手

- **打开就能选**：推荐、发现、已安装三个页面，没有无关统计和复杂设置。
- **介绍不截断**：每个项目展示完整介绍、源码、许可证、星标与更新时间。
- **来源先确认**：只有通过原生 DSH bundle 清单检查的项目才会入库；安装前再次锁定精确 npm 版本或 GitHub 提交。
- **决策更清楚**：全部项目都有透明的基础评估；人工推荐会说明适合谁和需要注意什么。
- **安装即启用**：安装、启用、停用、卸载都在一个页面完成；只管理由市场安装的插件。

## 安装

要求 `@deepseek-ai/dsh@0.1.0-rc.6` 和 Web profile。到 [Releases](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest) 下载最新版 `.tgz`，然后运行：

```bash
dsh plugin --profile web add --save-prod --save-exact --ignore-scripts \
  ./dsh-plugin-market-0.5.0.tgz
dsh web
```

打开 **设置 → 插件市场**。选择 **安装**，核对弹窗里的精确来源，再选择 **安装并启用**。

> [!IMPORTANT]
> 本项目是独立社区项目，与 DeepSeek 官方无隶属或背书关系。第三方插件以你的用户权限运行，可能读取本机文件或凭证并访问网络；目录检查和推荐都不是安全审计。

## 目录为什么可信

市场每六小时及手动刷新时合并 [awesome-dsh-plugin](https://awesome-dsh-plugin.com/) 与 GitHub `dsh-plugin` Topic。每个安装位置必须通过以下检查后才会展示：

1. 能获取到声明位置的 `package.json`；
2. 有合法包名；
3. 声明 `dsh.bundle.patch`；
4. 有可用的宿主入口。

当前内置快照从 1,373 个唯一安装位置中拒绝了 384 个无法证明为原生 DSH bundle 的候选，保留 936 个项目。GitHub 搜索单次查询最多返回 1,000 项，因此这里的“全部”是声明来源及其 API 上限内的全部，不代表整个互联网。

“清单已检查”只证明项目采用 DSH 插件结构；“已验证”还要求在指定 DSH 版本上完成构建、配置与启动验证。详细边界见 [数据来源](DATA_SOURCES.md) 和 [评估与推荐](EVALUATION.md)。

## 运行方式

- 启动时自动刷新，之后每六小时刷新一次；刷新失败继续使用上一个有效快照。
- GitHub Topic 最多读取十页；设置 `GITHUB_TOKEN` 可提高 API 容量。
- 安装会固定所确认的精确来源，并禁用依赖安装脚本；失败时回滚 profile 元数据。
- DSH rc.6 会缓存客户端包元数据，因此通用插件热插拔不安全；插件集合变化需重启 DSH Web。插件自身明确实现的局部热更新不受此限制。

手动重建离线目录：

```bash
DSH_GITHUB_PAGES=10 GITHUB_TOKEN=... pnpm registry:refresh
```

## 开发

需要 Node.js `22.19+` 或 `24+`、pnpm `11.5.1`，以及位于 `PATH` 的 DSH `0.1.0-rc.6`。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:contract
pnpm build
npm pack --dry-run
```

契约测试使用一次性 `DSH_HOME`，不会修改真实 profile。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，后续方向见 [ROADMAP.md](ROADMAP.md)。

---

**English:** A minimal, lightweight, easy-to-use plugin market built into DeepSeek Harness. It shows full project descriptions, admits only repositories with a valid native DSH bundle manifest, evaluates every listing, and confirms an exact source before one-click installation. The Chinese guide above is canonical; issues and pull requests in English are welcome.
