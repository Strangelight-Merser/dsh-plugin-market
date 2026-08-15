export const PLUGIN_CATEGORIES = [
  'ui',
  'theme',
  'session',
  'memory',
  'tools',
  'skill',
  'workflow',
  'notify',
  'model',
  'dev',
  'fun',
  'other',
] as const

export type PluginCategory = typeof PLUGIN_CATEGORIES[number]

export const PLUGIN_CATEGORY_LABELS: Readonly<Record<PluginCategory, string>> = {
  ui: '界面',
  theme: '主题',
  session: '会话',
  memory: '记忆',
  tools: '工具',
  skill: '技能',
  workflow: '自动化',
  notify: '通知',
  model: '模型',
  dev: '开发',
  fun: '娱乐',
  other: '其他',
}

interface CategoryRule {
  category: Exclude<PluginCategory, 'other'>
  keywords: readonly string[]
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  { category: 'theme', keywords: ['theme', 'skin', 'appearance', 'color scheme', 'wallpaper', '主题', '皮肤', '配色', '美化'] },
  { category: 'memory', keywords: ['memory', 'recall', 'knowledge base', 'knowledge graph', 'vector store', 'rag', 'context', '记忆', '知识库', '知识图谱', '检索', '上下文'] },
  { category: 'notify', keywords: ['notification', 'notify', 'webhook', 'feishu', 'lark', 'telegram', 'discord', 'slack', 'email', '通知', '提醒', '飞书', '邮件'] },
  { category: 'model', keywords: ['model provider', 'llm provider', 'inference provider', 'openrouter', 'ollama', 'anthropic', 'openai', '模型提供商', '模型接入', '模型路由', '推理服务'] },
  { category: 'session', keywords: ['session', 'conversation', 'chat history', 'side chat', 'sidebar', 'workspace', 'archive', 'handoff', '会话', '对话', '侧边栏', '工作区', '归档', '历史记录'] },
  { category: 'skill', keywords: ['skill', 'skills', 'skill viewer', 'skill manager', 'prompt library', 'prompt manager', '技能', '提示词'] },
  { category: 'workflow', keywords: ['workflow', 'automation', 'orchestration', 'subagent', 'agent team', 'scheduler', 'auto continue', 'pipeline', '工作流', '自动化', '编排', '子代理', '定时', '流水线'] },
  { category: 'ui', keywords: ['web ui', 'webui', 'user interface', 'dashboard', 'panel', 'viewer', 'preview', 'canvas', 'terminal ui', 'tui', '界面', '面板', '看板', '预览', '画布', '终端界面'] },
  { category: 'dev', keywords: ['developer', 'devtool', 'debug', 'testing', 'test runner', 'benchmark', 'profiler', 'sdk', 'api client', 'code review', 'git', '开发', '调试', '测试', '性能分析', '代码审查'] },
  { category: 'fun', keywords: ['emoji', 'game', 'meme', 'music', 'pet', 'pixel art', 'anime', '表情', '游戏', '音乐', '宠物', '像素', '动漫', '娱乐'] },
  { category: 'tools', keywords: ['tool', 'tools', 'browser', 'search', 'finder', 'file', 'shell', 'command', 'interpreter', 'mcp', 'usage', 'token', 'cost', 'report', 'market', 'plugin manager', '工具', '浏览器', '搜索', '文件', '命令', '解释器', '用量', '成本', '报告', '插件市场'] },
]

export interface PluginCategoryInput {
  name: string
  description?: string
  topics?: readonly string[]
}

export function isPluginCategory(value: unknown): value is PluginCategory {
  return typeof value === 'string' && (PLUGIN_CATEGORIES as readonly string[]).includes(value)
}

function containsKeyword(text: string, keyword: string): boolean {
  if (!/^[a-z0-9]+$/.test(keyword)) return text.includes(keyword)
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(text)
}

export function inferPluginCategory(input: PluginCategoryInput): PluginCategory {
  const name = input.name.toLocaleLowerCase()
  const description = (input.description ?? '').toLocaleLowerCase()
  const topics = (input.topics ?? []).join(' ').toLocaleLowerCase()
  let winner: PluginCategory = 'other'
  let winnerScore = 0

  for (const rule of CATEGORY_RULES) {
    let score = 0
    for (const keyword of rule.keywords) {
      if (containsKeyword(name, keyword)) score += 4
      if (containsKeyword(topics, keyword)) score += 3
      if (containsKeyword(description, keyword)) score += 1
    }
    if (score > winnerScore) {
      winner = rule.category
      winnerScore = score
    }
  }
  return winner
}

export function resolvePluginCategory(declared: unknown, input: PluginCategoryInput): PluginCategory {
  if (isPluginCategory(declared) && declared !== 'other') return declared
  return inferPluginCategory(input)
}
