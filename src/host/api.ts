import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import registryData from '../../data/registry-v1.json' with { type: 'json' }
import { readManagedState } from '../core/managed-state.ts'
import { lifecycleState, readProfileManifest } from '../core/profile.ts'
import { installBlockReason, RegistrySnapshotSchema, SUPPORTED_DSH_VERSION, type RegistrySnapshot } from '../core/registry.ts'
import { LifecycleError, PluginLifecycleService, type LifecycleAction } from '../lifecycle/service.ts'
import { RegistryProvider } from '../registry/provider.ts'

export const API_PREFIX = '/api/dsh-market/v1'
const MAX_BODY_BYTES = 16 * 1024

const PluginIdSchema = z.string().min(1).max(200)
const PreviewRequestSchema = z.object({ id: PluginIdSchema }).strict()
const ActionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('install'), id: PluginIdSchema, expectedRef: z.string().min(1).max(500) }).strict(),
  z.object({ action: z.enum(['enable', 'disable', 'uninstall']), id: PluginIdSchema }).strict(),
])

export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

export interface WebServerService {
  register(route: WebRoute): () => void
}

interface JsonResponse {
  status: number
  body: unknown
}

function respond(response: ServerResponse, result: JsonResponse, head = false): void {
  const body = JSON.stringify(result.body)
  response.writeHead(result.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(head ? undefined : body)
}

export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new LifecycleError('request body is too large')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new LifecycleError('request body is not valid JSON')
  }
}

export function loadBundledRegistry(): RegistrySnapshot {
  return RegistrySnapshotSchema.parse(registryData)
}

export class HostApi {
  constructor(
    private readonly registry: RegistryProvider,
    private readonly lifecycle: PluginLifecycleService,
  ) {}

  routes(): WebRoute[] {
    return [
      { kind: 'exact', path: `${API_PREFIX}/catalog`, handler: (request, response) => this.catalog(request, response) },
      { kind: 'exact', path: `${API_PREFIX}/installed`, handler: (request, response) => this.installed(request, response) },
      { kind: 'exact', path: `${API_PREFIX}/registry/refresh`, handler: (request, response) => this.refreshRegistry(request, response) },
      { kind: 'exact', path: `${API_PREFIX}/preview`, handler: (request, response) => this.preview(request, response) },
      { kind: 'exact', path: `${API_PREFIX}/actions`, handler: (request, response) => this.action(request, response) },
    ]
  }

  private catalog(request: IncomingMessage, response: ServerResponse): void {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      respond(response, { status: 405, body: { error: 'method not allowed' } })
      return
    }
    const snapshot = this.registry.current()
    respond(response, {
      status: 200,
      body: {
        schemaVersion: snapshot.schemaVersion,
        generatedAt: snapshot.generatedAt,
        supportedDshVersion: SUPPORTED_DSH_VERSION,
        refresh: this.registry.status(),
        lifecycle: {
          installDefault: 'active',
          communityInstall: {
            supported: true,
            exactResolution: true,
            dependencyScripts: false,
          },
          hotSwap: {
            supported: false,
            reason: 'DSH rc.6 caches client package metadata; arbitrary plugin-set changes require a DSH Web restart.',
          },
        },
        entries: snapshot.entries.map((entry) => ({ ...entry, installBlockReason: installBlockReason(entry) })),
      },
    }, request.method === 'HEAD')
  }

  private async refreshRegistry(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      respond(response, { status: 405, body: { error: 'method not allowed' } })
      return
    }
    if (!isSameOrigin(request.headers.origin, request.headers.host)) {
      respond(response, { status: 403, body: { error: 'same-origin request required' } })
      return
    }
    const result = await this.registry.refresh()
    respond(response, { status: result.updated ? 200 : 502, body: result.updated ? result : { ...result, error: result.status.error } })
  }

  private async installed(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      respond(response, { status: 405, body: { error: 'method not allowed' } })
      return
    }
    try {
      const manifest = await readProfileManifest(this.lifecycle.profileDir)
      const managerState = await readManagedState(this.lifecycle.profileDir)
      const packageNames = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...(manifest.dsh?.profile?.bundles ?? []),
      ])
      const plugins = [...packageNames].sort().map((packageName) => ({
        packageName,
        managed: managerState.plugins[packageName] !== undefined,
        id: managerState.plugins[packageName]?.id ?? null,
        state: lifecycleState(manifest, packageName, managerState.plugins[packageName] !== undefined),
      }))
      respond(response, { status: 200, body: { profile: this.lifecycle.profile, plugins } }, request.method === 'HEAD')
    } catch (error) {
      this.internalError(response, error)
    }
  }

  private async action(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      respond(response, { status: 405, body: { error: 'method not allowed' } })
      return
    }
    if (!isSameOrigin(request.headers.origin, request.headers.host)) {
      respond(response, { status: 403, body: { error: 'same-origin request required' } })
      return
    }
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      respond(response, { status: 415, body: { error: 'application/json required' } })
      return
    }
    try {
      const input = ActionRequestSchema.parse(await readJsonBody(request))
      const result = await this.lifecycle.perform(
        input.action as LifecycleAction,
        input.id,
        input.action === 'install' ? input.expectedRef : undefined,
      )
      respond(response, { status: 200, body: result })
    } catch (error) {
      if (error instanceof LifecycleError || error instanceof z.ZodError) {
        respond(response, { status: 409, body: { error: error.message } })
        return
      }
      this.internalError(response, error)
    }
  }

  private async preview(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      respond(response, { status: 405, body: { error: 'method not allowed' } })
      return
    }
    if (!isSameOrigin(request.headers.origin, request.headers.host)) {
      respond(response, { status: 403, body: { error: 'same-origin request required' } })
      return
    }
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      respond(response, { status: 415, body: { error: 'application/json required' } })
      return
    }
    try {
      const input = PreviewRequestSchema.parse(await readJsonBody(request))
      respond(response, { status: 200, body: await this.lifecycle.preview(input.id) })
    } catch (error) {
      if (error instanceof LifecycleError || error instanceof z.ZodError) {
        respond(response, { status: 409, body: { error: error.message } })
        return
      }
      this.internalError(response, error)
    }
  }

  private internalError(response: ServerResponse, error: unknown): void {
    respond(response, { status: 500, body: { error: 'internal error' } })
    process.stderr.write(`dsh-plugin-market: ${String(error)}\n`)
  }
}
