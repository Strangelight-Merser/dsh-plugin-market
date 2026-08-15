<div align="center">

# DSH Plugin Market

### 900+ DSH 插件，一个搜索框，一个安装按钮。

极简、轻量、开箱即用。直接在 DeepSeek Harness 里发现、安装和管理插件。

[![Release](https://img.shields.io/github/v/release/Strangelight-Merser/dsh-plugin-market?style=flat-square&color=6c63ff)](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Strangelight-Merser/dsh-plugin-market/ci.yml?branch=main&style=flat-square)](https://github.com/Strangelight-Merser/dsh-plugin-market/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Strangelight-Merser/dsh-plugin-market?style=flat-square)](LICENSE)

[安装](#安装) · [功能](#功能) · [可信目录](#可信目录) · [English](#english)

</div>

## 安装

复制下面这条命令并运行：

```bash
dsh plugin --profile web add --ignore-scripts https://github.com/Strangelight-Merser/dsh-plugin-market/releases/download/v0.5.0/dsh-plugin-market-0.5.0.tgz
```

安装完成后启动或重启 DSH：

```bash
dsh web
```

打开 **设置 → 插件市场**。当前版本支持 `@deepseek-ai/dsh@0.1.0-rc.6` 的 Web profile。

## 功能

- **推荐**：先看经过人工复核、写明用途和风险的项目。
- **发现**：搜索完整目录，按 GitHub 星标或更新时间排序。
- **完整介绍**：长描述不截断，源码、许可证和评估集中展示。
- **一键管理**：安装后默认启用，也可停用、重新启用或卸载。
- **自动更新**：启动时、每六小时和手动触发时刷新目录。

## 可信目录

名字带 DSH 或打了 GitHub Topic，不代表它就是插件。每个入库位置都必须具有合法包名、`dsh.bundle.patch` 和宿主入口；安装前还会再次锁定精确 npm 版本或 GitHub 提交。

| 标签 | 含义 |
|---|---|
| **清单已检查** | 已确认原生 DSH 插件结构，但不是安全审计 |
| **已验证** | 已在指定 DSH 版本上完成构建、配置和启动验证 |

> [!IMPORTANT]
> 本项目是独立社区项目。第三方插件以你的用户权限运行，可能读取文件、凭证并访问网络，只安装你信任的来源。

依赖安装脚本始终禁用。DSH rc.6 的插件集合变化需要重启 Web，安装失败会回滚 profile 元数据。

[评估与推荐](EVALUATION.md) · [数据来源](DATA_SOURCES.md) · [安全策略](SECURITY.md) · [路线图](ROADMAP.md)

<details>
<summary>开发与贡献</summary>

需要 Node.js `22.19+` 或 `24+`、pnpm `11.5.1` 和 DSH `0.1.0-rc.6`。

依次运行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`、`pnpm test:contract` 和 `pnpm build`。

阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 后提交贡献。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

</details>

## English

A minimal, lightweight plugin market built into DeepSeek Harness. Search 900+ manifest-checked plugins, read full descriptions, confirm an exact source, then install and enable from one screen. The current release targets `@deepseek-ai/dsh@0.1.0-rc.6` and the Web profile.

Run the single install command above, restart `dsh web`, then open **Settings → Plugin Market**.
