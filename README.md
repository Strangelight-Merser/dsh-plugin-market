<div align="center">

# DSH Plugin Market

### 900+ DSH 插件，一个搜索框，一个安装按钮。

在 DeepSeek Harness 里发现、安装和管理插件。极简、轻量、开箱即用。

[![Release](https://img.shields.io/github/v/release/Strangelight-Merser/dsh-plugin-market?style=flat-square&color=766cf6)](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Strangelight-Merser/dsh-plugin-market/ci.yml?branch=main&style=flat-square)](https://github.com/Strangelight-Merser/dsh-plugin-market/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Strangelight-Merser/dsh-plugin-market?style=flat-square)](LICENSE)

</div>

![DSH Plugin Market 真实界面：功能分类、推荐、排序与批量重启](assets/plugin-market.jpg)

## 安装

**v0.7.0** 支持 `@deepseek-ai/dsh@0.1.5-rc.1` 和 `0.1.5-rc.2` 的 Web profile。
截至 2026-09-12，npm `latest` 指向 rc.1，`next` 指向 rc.2；支持范围仅包含已测试的这两个版本。

安装或升级到 v0.7.0（Node 22.19+、pnpm 11.5.1）：

```bash
dsh plugin --profile web add --ignore-scripts https://github.com/Strangelight-Merser/dsh-plugin-market/releases/download/v0.7.0/dsh-plugin-market-0.7.0.tgz
```

也可以从源码构建：

```bash
git clone https://github.com/Strangelight-Merser/dsh-plugin-market.git
cd dsh-plugin-market
pnpm install --frozen-lockfile
pnpm pack --pack-destination .
dsh plugin --profile web add --ignore-scripts "$PWD/dsh-plugin-market-0.7.0.tgz"
```

安装后重新启动 `dsh web`，使用终端打印的带登录 token 的本机链接打开页面，进入 **设置 → 插件市场**。
新版 dsh 会保护页面和 API；正常从该链接进入后，市场请求与批量重启沿用浏览器登录状态。

v0.5.0 面向旧版 dsh；使用当前支持版本时，请升级到 v0.7.0。

开发验证：`pnpm test` 运行单元测试；`pnpm test:contract` 构建发布包，在临时 `DSH_HOME` 中用当前 PATH 上的 dsh 检查安装、停用、启用、卸载、失败回滚、Web 登录及真实批量重启。CI 分别运行两个支持版本。

## 能做什么

- 按界面、主题、会话、记忆、工具等功能分类，支持星标与更新时间排序。
- 展示完整介绍、源码、许可证和基础评估，人工推荐值得先看的项目。
- 一键安装并默认启用，也可停用、启用或卸载。
- 连续完成多项操作后，一键重启统一生效。
- 启动时、每六小时或手动刷新在线目录。

## 安全边界

入库项目必须具有合法包名、`dsh.bundle.patch` 和宿主入口；这不是安全审计或兼容性承诺。依赖安装脚本始终禁用，第三方插件仍会以你的用户权限运行，请只安装你信任的来源。

[评估与推荐](EVALUATION.md) · [数据来源](DATA_SOURCES.md) · [安全策略](SECURITY.md) · [路线图](ROADMAP.md) · [参与贡献](CONTRIBUTING.md)

## English

A minimal plugin market built into DeepSeek Harness. Discover 900+ plugins by function, inspect their source and assessment, manage them in one click, then apply every pending change with a single restart.
