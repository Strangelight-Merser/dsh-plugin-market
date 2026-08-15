import { describe, expect, it } from 'vitest'
import { inferPluginCategory, resolvePluginCategory } from '../src/core/category.ts'

describe('functional plugin categories', () => {
  it('keeps an explicit upstream category', () => {
    expect(resolvePluginCategory('memory', { name: 'Theme-like name' })).toBe('memory')
  })

  it.each([
    ['dsh-skill-viewer', 'Manage skills in the Web UI', 'skill'],
    ['dsh-side-chat', '在侧边栏中继续一段会话', 'session'],
    ['dsh-lark-bot', '把 DSH 桥接进飞书 bot', 'notify'],
    ['dsh-qq2006', '为 DSH 注册 QQ2006 主题和皮肤', 'theme'],
    ['dsh-commandcode-provider', 'Unofficial DSH LLM provider', 'model'],
    ['dsh-plugin-interpreters', 'Exposes run_python and run_node tools', 'tools'],
  ])('classifies %s by its function', (name, description, expected) => {
    expect(inferPluginCategory({ name, description })).toBe(expected)
  })

  it('uses GitHub topics when the description is empty', () => {
    expect(inferPluginCategory({ name: 'extension', topics: ['workflow', 'dsh-plugin'] })).toBe('workflow')
  })

  it('leaves unknown plugins in other', () => {
    expect(inferPluginCategory({ name: 'dsh-extension', description: 'An extension for DSH' })).toBe('other')
  })
})
