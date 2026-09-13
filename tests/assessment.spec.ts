import { describe, expect, it } from 'vitest'
import { assessEntry } from '../src/core/assessment.ts'
import { RegistryEntrySchema, SUPPORTED_DSH_VERSIONS } from '../src/core/registry.ts'

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
        dshVersion: SUPPORTED_DSH_VERSIONS[0],
        checkedAt: reference.toISOString(),
        platform: 'darwin',
        manifest: 'pass', artifacts: 'pass', dumpConfig: 'pass', boot: 'pass',
      },
    })
    expect(assessEntry(verified, reference).score).toBeGreaterThan(assessEntry(base, reference).score)
    expect(assessEntry(verified, reference).cautions).not.toContain('尚未进行运行时安全审查')
    const historical = RegistryEntrySchema.parse({ ...verified, evidence: { ...verified.evidence, dshVersion: '0.1.0-rc.6' } })
    expect(assessEntry(historical, reference).score).toBe(assessEntry(base, reference).score)
    expect(assessEntry(historical, reference).cautions).toContain('运行验证仅覆盖 DSH 0.1.0-rc.6，未覆盖当前支持版本')
  })
  it('does not award open-source credit to proprietary or unrecognized license declarations', () => {
    const approved = assessEntry(installable(), reference)
    for (const license of ['UNLICENSED', 'Proprietary', 'SEE LICENSE IN LICENSE.txt']) {
      const result = assessEntry(installable({ license }), reference)
      expect(result.score).toBe(approved.score - 10)
      expect(result.cautions).toContain('未识别到已确认的开源许可证')
      expect(result.reasons).not.toContain(`许可证 ${license}`)
    }
  })

})
