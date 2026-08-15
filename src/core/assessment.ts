import type { RegistryEntry } from './registry.ts'

export type AssessmentTier = 'strong' | 'promising' | 'listed' | 'excluded'

export interface CatalogAssessment {
  score: number
  tier: AssessmentTier
  reasons: string[]
  cautions: string[]
}

function ageDays(value: string | null | undefined, reference: Date): number | null {
  if (value === null || value === undefined) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, (reference.getTime() - timestamp) / 86_400_000)
}

function maintenanceScore(days: number | null): number {
  if (days === null) return 0
  if (days <= 180) return 20
  if (days <= 365) return 15
  if (days <= 730) return 8
  return 2
}

function adoptionScore(stars: number | null | undefined): number {
  if (stars === null || stars === undefined) return 0
  if (stars >= 1_000) return 20
  if (stars >= 100) return 17
  if (stars >= 25) return 14
  if (stars >= 5) return 10
  if (stars >= 1) return 6
  return 2
}

export function assessEntry(entry: RegistryEntry, reference = new Date()): CatalogAssessment {
  if (entry.status === 'blocked') {
    return { score: 0, tier: 'excluded', reasons: [], cautions: ['已被目录明确阻止安装'] }
  }

  const reasons: string[] = []
  const cautions: string[] = []
  let score = entry.status === 'verified' ? 40 : 30
  reasons.push(entry.status === 'verified' ? '已完成 DSH 运行验证' : '已确认原生 DSH 插件清单')

  if (entry.description.zh.trim().length > 0 || entry.description.en.trim().length > 0) score += 10
  const days = ageDays(entry.discovery?.pushedAt, reference)
  score += maintenanceScore(days)
  if (days !== null && days <= 180) reasons.push('半年内有代码更新')
  else if (days === null) cautions.push('缺少最近维护时间')
  else if (days > 730) cautions.push('超过两年未更新')

  const stars = entry.discovery?.stars
  score += adoptionScore(stars)
  if (stars !== null && stars !== undefined && stars >= 25) reasons.push(`${stars} 个 GitHub 星标`)

  if (entry.license === null) cautions.push('未识别到开源许可证')
  else {
    score += 10
    reasons.push(`许可证 ${entry.license}`)
  }
  if (entry.status !== 'verified') cautions.push('尚未进行运行时安全审查')

  const tier: AssessmentTier = entry.status === 'verified' || score >= 75
    ? 'strong'
    : score >= 60 ? 'promising' : 'listed'
  return { score, tier, reasons, cautions }
}
