<div align="center">

# DSH Plugin Market

### 900+ DSH 插件，一个搜索框，一个安装按钮。

极简、轻量、开箱即用。直接在 DeepSeek Harness 设置页里发现插件、读完整介绍、确认精确来源，然后安装并默认启用。

[![Release](https://img.shields.io/github/v/release/Strangelight-Merser/dsh-plugin-market?style=flat-square&color=6c63ff)](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Strangelight-Merser/dsh-plugin-market/ci.yml?branch=main&style=flat-square)](https://github.com/Strangelight-Merser/dsh-plugin-market/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/Strangelight-Merser/dsh-plugin-market?style=flat-square)](LICENSE)

[30 秒上手](#30-秒上手) · [为什么用它](#为什么用它) · [可信目录](#从发现到安装) · [English](#english)

</div>

> [!IMPORTANT]
> 独立社区项目，不代表 DeepSeek 官方。第三方插件以你的用户权限运行；目录检查与推荐都不是安全审计。

## 30 秒上手

当前版本面向 `@deepseek-ai/dsh@0.1.0-rc.6` 的 `web` profile。

macOS / Linux：

```bash
# 1. 下载当前稳定版
curl -fLO https://github.com/Strangelight-Merser/dsh-plugin-market/releases/download/v0.5.0/dsh-plugin-market-0.5.0.tgz

# 2. 安装并启动
dsh plugin --profile web add --save-prod --save-exact --ignore-scripts \
  ./dsh-plugin-market-0.5.0.tgz
dsh web
```

<details>
<summary>Windows PowerShell</summary>

```powershell
Invoke-WebRequest `
  -Uri https://github.com/Strangelight-Merser/dsh-plugin-market/releases/download/v0.5.0/dsh-plugin-market-0.5.0.tgz `
  -OutFile dsh-plugin-market-0.5.0.tgz

dsh plugin --profile web add --save-prod --save-exact --ignore-scripts `
  ./dsh-plugin-market-0.5.0.tgz
dsh web
```

</details>

打开 **设置 → 插件市场**，接下来只需三步：

1. 搜索插件，或从“推荐”开始；
2. 查看完整介绍、评估和源码；
3. 点击 **安装**，核对精确来源，再选择 **安装并启用**。

已经运行着 DSH Web？安装后重启一次即可看到插件市场。

<details>
<summary>校验下载文件（可选）</summary>

v0.5.0 发布包 SHA-256：

```text
131d497acf8723e65ed6d1b14665efd9bd85f3e60f96ba5daf6380008407a818
```

也可以前往 [Releases](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest) 手动下载。

</details>

## 为什么用它

| 找插件 | 做决定 | 管理插件 |
|---|---|---|
| 聚合维护目录与 GitHub `dsh-plugin` Topic，自动定期刷新 | 完整介绍、人工推荐、基础评估、许可证与源码都在一张卡片里 | 安装、启用、停用、卸载都在同一页面完成 |

- **够简单**：只有“推荐 / 发现 / 已安装”三个页面，没有无关仪表盘和复杂配置。
- **不截断**：项目介绍完整换行展示，长描述也能读完。
- **不乱收录**：名字像 DSH、打了 Topic，都不足以入库；必须先通过原生 bundle 清单检查。
- **不盲装**：安装前重新解析来源，展示精确 npm 版本或 GitHub 提交供你确认。
- **不接管一切**：只管理经本市场安装的插件，不碰已有的外部安装。

支持按 **GitHub 星标** 或 **最近更新时间** 排序；全部入库项目都有安装入口，安装后默认启用。

## 从发现到安装

```text
公共目录与 GitHub Topic
          ↓
原生 DSH 清单门禁
          ↓
完整介绍 + 透明评估 + 人工推荐
          ↓
安装前锁定精确版本或提交
          ↓
安装并默认启用
```

每个安装位置必须同时满足：

- 能读取声明位置的 `package.json`；
- 包名合法；
- 声明 `dsh.bundle.patch`；
- 提供可用的宿主入口。

目录里的信任标签有严格边界：

| 标签 | 它证明了什么 | 它没有证明什么 |
|---|---|---|
| **清单已检查** | 项目采用原生 DSH 插件结构 | 安全、质量和当前 DSH 版本兼容性 |
| **已验证** | 在指定 DSH 版本上完成构建、配置与启动验证 | 对未来版本或所有平台永久兼容 |
| **不可用** | 已被目录明确阻止安装 | — |

高分和高星不会自动获得“推荐”。人工推荐必须说明适合谁、复核日期和主要风险，且不接受付费排名。详见 [评估与推荐](EVALUATION.md)。

<details>
<summary>v0.5.0 目录数字与 API 边界</summary>

- 发现 1,373 个唯一安装位置；
- 拒绝 384 个无法证明为原生 DSH bundle 的候选；
- 内置离线快照收录 936 项；真实在线刷新验收得到 951 项；
- GitHub Search 每个查询最多返回 1,000 项，因此“全部”指声明来源及其 API 上限内的全部。

</details>

## 安全与运行边界

- 第三方插件可能读取本机文件、凭证并访问网络，只安装你信任的来源。
- 依赖安装脚本始终禁用；因此依赖原生构建脚本的插件可能无法通过安全安装路径运行。
- 安装失败会回滚 profile 元数据，但不会把清单检查包装成兼容性保证。
- DSH rc.6 会缓存客户端包元数据，通用插件集合变更需要重启 DSH Web；只有插件自身明确支持的局部能力才能热更新。
- 启动时、每六小时以及手动触发时刷新目录；在线来源失败会继续使用上一个有效快照。

更多细节：[数据来源](DATA_SOURCES.md) · [安全策略](SECURITY.md) · [后续路线](ROADMAP.md)

## 开发与贡献

需要 Node.js `22.19+` 或 `24+`、pnpm `11.5.1`，以及位于 `PATH` 的 DSH `0.1.0-rc.6`。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm test:contract
pnpm build
npm pack --dry-run
```

契约测试使用一次性 `DSH_HOME`，不会修改真实 profile。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## English

**DSH Plugin Market** is a minimal, lightweight plugin market built directly into DeepSeek Harness. Search 900+ manifest-checked DSH plugins, read their full descriptions, review source and evidence, then install and enable them from one screen.

- Three focused views: Recommended, Discover, Installed.
- Strict admission: a GitHub topic or repository name alone is never enough.
- Exact-source confirmation before installation.
- Transparent assessment for every listing and human-reviewed recommendations with explicit caveats.
- Star and recent-update sorting, periodic refresh, offline fallback, and rollback on failed installs.

The current release targets `@deepseek-ai/dsh@0.1.0-rc.6` and the Web profile. Follow the [30-second setup](#30-秒上手) above, or download the package from [GitHub Releases](https://github.com/Strangelight-Merser/dsh-plugin-market/releases/latest).

This is an independent community project and is not affiliated with or endorsed by DeepSeek. Manifest admission and recommendations are not security audits or compatibility guarantees.
