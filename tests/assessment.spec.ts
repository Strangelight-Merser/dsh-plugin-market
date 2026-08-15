import { describe, expect, it } from 'vitest'
import { assessEntry } from '../src/core/assessment.ts'
import { RegistryEntrySchema, SUPPORTED_DSH_VERSION } from '../src/core/registry.ts'

const reference = new Date('2026-08-15T00:00:00.000Z')

function installable(input: Record<string, unknown> = {}) {
  return RegistryEntrySchema.parse({
    id: 'github:example/tool',
    name: 'DSH Tool',
    description: { en: 'Useful tool', zh: '实用工具' },
    category: 'tools',
    repositoryUrl: 'https://github.com/example/tool',
    license: 'MIT',
    source: null,
    installHint: { kind: 'github', repository: 'example/tool', path: null },
    status: 'installable',
    validation: { manifest: 'pass', checkedAt: reference.toISOString(), packageName: 'dsh-tool' },
    discovery: { sources: ['github-topic'], stars: 40, pushedAt: '2026-08-01T00:00:00.000Z' },
    ...input,
  })
}

describe('catalog assessment', () => {
  it('scores every admitted project from explicit evidence and records the security caveat', () => {
    const result = assessEntry(installable(), reference)
    expect(result).toEqual(expect.objectContaining({ score: 84, tier: 'strong' }))
    expect(result.reasons).toContain('已确认原生 DSH 插件清单')
    expect(result.cautions).toContain('尚未进行运行时安全审查')
  })

  it('gives runtime verification more weight than manifest-only admission', () => {
    const base = installable()
    const verified = RegistryEntrySchema.parse({
      ...base,
      status: 'verified',
      source: { kind: 'npm', packageName: 'dsh-tool', version: '1.0.0' },
      evidence: {
        dshVersion: SUPPORTED_DSH_VERSION,
        checkedAt: reference.toISOString(),
        platform: 'darwin',
        manifest: 'pass', artifacts: 'pass', dumpConfig: 'pass', boot: 'pass',
      },
    })
    expect(assessEntry(verified, reference).score).toBeGreaterThan(assessEntry(base, reference).score)
    expect(assessEntry(verified, reference).cautions).not.toContain('尚未进行运行时安全审查')
  })
})
