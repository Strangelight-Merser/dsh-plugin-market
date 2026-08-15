import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectInstalledBundle, isApprovedOpenSourceLicense } from '../src/core/installed-bundle.ts'

const here = dirname(fileURLToPath(import.meta.url))
const temporaryProfiles: string[] = []

afterEach(async () => {
  await Promise.all(temporaryProfiles.splice(0).map((profile) => rm(profile, { recursive: true, force: true })))
})

async function profileWithLinkedFixture(fixture: string, packageName: string): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), 'dsh-verified-inspect-'))
  temporaryProfiles.push(profile)
  const nodeModules = join(profile, 'node_modules')
  await mkdir(nodeModules)
  await symlink(join(here, '..', 'fixtures', fixture), join(nodeModules, packageName), 'dir')
  return profile
}

describe('installed bundle validation', () => {
  it('accepts a matching open-source native bundle with real artifacts', async () => {
    const profile = await profileWithLinkedFixture('valid-plugin', 'dsh-verified-fixture-plugin')
    const result = await inspectInstalledBundle(profile, {
      packageName: 'dsh-verified-fixture-plugin',
      license: 'MIT',
      strictLicense: true,
    })
    expect(result.patchPath).toMatch(/cordis\.patch\.yml$/)
    expect(result.entrypointPath).toMatch(/index\.js$/)
  })

  it('fails closed when dsh.bundle.patch is absent', async () => {
    const profile = await profileWithLinkedFixture('invalid-plugin', 'dsh-verified-invalid-fixture')
    await expect(inspectInstalledBundle(profile, {
      packageName: 'dsh-verified-invalid-fixture',
      license: 'MIT',
      strictLicense: true,
    })).rejects.toThrow('no dsh.bundle.patch')
  })

  it('validates community artifacts without pretending their license was verified', async () => {
    const profile = await profileWithLinkedFixture('valid-plugin', 'dsh-verified-fixture-plugin')
    await expect(inspectInstalledBundle(profile, {
      packageName: 'dsh-verified-fixture-plugin',
      license: null,
      strictLicense: false,
    })).resolves.toMatchObject({ license: 'MIT' })
  })

  it('uses an explicit open-source license allowlist', () => {
    expect(isApprovedOpenSourceLicense('MIT')).toBe(true)
    expect(isApprovedOpenSourceLicense('SEE LICENSE IN LICENSE.txt')).toBe(false)
  })
})
