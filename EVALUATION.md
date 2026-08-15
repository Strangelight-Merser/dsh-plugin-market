# 评估与推荐

目录评估用于帮助筛选，不是安全审计、兼容性认证或质量保证。

## 每个项目如何评估

基础分满分 100，完全由可复核的目录证据生成：

| 证据 | 分值 |
|---|---:|
| 真实 DSH 运行验证 / 原生清单检查 | 40 / 30 |
| 半年内更新 / 一年内 / 两年内 / 更久 | 20 / 15 / 8 / 2 |
| GitHub 星标采用度 | 0–20 |
| 有可用介绍 | 10 |
| 能识别开源许可证 | 10 |

卡片中的“基础评估”可以展开，查看加分证据和注意事项。缺少更新时间、许可证或运行验证会明确提示，不会被默认补成正面结论。

人工“推荐”另行维护：必须先确认用途清楚、对普通 DSH 用户有直接价值，并写明适用场景与主要风险。高分或高星不会自动获得推荐。

## 当前推荐

| 项目 | 推荐理由 | 主要注意事项 |
|---|---|---|
| [dsh-find-plugin](https://github.com/awesome-dsh-plugin/dsh-find-plugin) | 会话内按需求搜索插件，最适合作为生态入口 | 本项目的真实运行验证目前仅覆盖 macOS + DSH rc.6 |
| [dsh-skill-viewer](https://github.com/Fishquito7/dsh-skill-viewer) | 在 Web 设置中集中管理 Skills，操作路径短 | 仅完成清单检查，未做运行时安全审查 |
| [dsh-context](https://github.com/bowenliang123/dsh-context) | 直观看到上下文组成、压缩和 token 变化 | 统计准确性可能受 DSH 版本变化影响 |
| [dsh-vision-router](https://github.com/ysr666/dsh-vision-router) | 为文本 Agent 增加图片问答、OCR 与像素工具 | 默认视觉链使用第三方匿名端点，不应用于敏感图片 |
| [dsh-share](https://github.com/hellodigua/dsh-share) | 极少操作即可分享会话，适合演示和协作 | 分享前需检查凭证、路径和其他敏感内容 |
| [dsh-suite plugin-notify](https://github.com/whyihaveyou/dsh-suite/tree/main/packages/plugins/plugin-notify) | 长任务完成、出错或待审批时发送通知 | Webhook 会向外部服务发送事件摘要 |

推荐数据位于 `data/recommendations.json`。更改推荐必须通过 Pull Request，说明复核日期、证据和风险；推荐不接受付费排名。

## 当前快照

- 来源记录：502 条 awesome-dsh-plugin、GitHub Topic 查询上限 1,000 条。
- 唯一安装位置：1,373。
- 拒绝：384 个未通过原生 DSH 清单检查的位置。
- 入库：936 项；其中 1 项有版本限定的真实运行验证，935 项为清单已检查。

这些数字来自 2026-08-15 生成的内置快照，会随上游目录变化。
