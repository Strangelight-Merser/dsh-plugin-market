import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostApi, API_PREFIX } from '../src/host/api.ts'
import type { PluginLifecycleService } from '../src/lifecycle/service.ts'
import { RegistryProvider } from '../src/registry/provider.ts'
import { RegistrySnapshotSchema } from '../src/core/registry.ts'

const snapshot = RegistrySnapshotSchema.parse({
  schemaVersion: 1,
  generatedAt: '2026-08-15T00:00:00.000Z',
  entries: [{
    id: 'github:example/tool',
    name: 'Example tool',
    description: { en: 'Tool', zh: '工具' },
    category: 'tools',
    repositoryUrl: 'https://github.com/example/tool',
    license: 'MIT',
    source: { kind: 'npm', packageName: 'example-tool', version: '1.0.0' },
    installHint: { kind: 'npm', packageName: 'example-tool' },
    status: 'installable',
    validation: { manifest: 'pass', checkedAt: '2026-08-15T00:00:00.000Z', packageName: 'example-tool' },
  }],
})

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
  })))
})

describe('host action restart handoff', () => {
  it('returns the install response before scheduling an automatic restart', async () => {
    const perform = vi.fn(async () => ({
      action: 'install' as const,
      id: 'github:example/tool',
      packageName: 'example-tool',
      state: 'active' as const,
      resolvedRef: 'example-tool@1.0.0',
      runtimeEffect: 'restart-required' as const,
    }))
    const lifecycle = {
      profile: 'web',
      profileDir: '/tmp/unused-profile',
      perform,
    } as unknown as PluginLifecycleService
    const schedule = vi.fn()
    const api = new HostApi(new RegistryProvider(snapshot), lifecycle, { schedule })
    const route = api.routes().find((candidate) => candidate.path === `${API_PREFIX}/actions`)
    expect(route).toBeDefined()
    const server = createServer((request, response) => { void route!.handler(request, response) })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const origin = `http://127.0.0.1:${port}`

    const response = await fetch(`${origin}${API_PREFIX}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ action: 'install', id: 'github:example/tool', expectedRef: 'example-tool@1.0.0' }),
    })
    const body = await response.json() as { runtimeEffect: string }

    expect(response.status).toBe(200)
    expect(body.runtimeEffect).toBe('restarting')
    expect(perform).toHaveBeenCalledWith('install', 'github:example/tool', 'example-tool@1.0.0')
    expect(schedule).toHaveBeenCalledTimes(1)
  })
})
