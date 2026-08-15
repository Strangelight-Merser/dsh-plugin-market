import type { Context } from '@deepseek-ai/cordis'
import { HostApi, loadBundledRegistry, type WebServerService } from './host/api.ts'
import { PluginLifecycleService } from './lifecycle/service.ts'
import { RegistryProvider } from './registry/provider.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: WebServerService
  }
}

export const name = 'dsh-plugin-market'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  const snapshot = loadBundledRegistry()
  const registry = new RegistryProvider(snapshot)
  const lifecycle = PluginLifecycleService.create(() => registry.current(), 'web')
  const api = new HostApi(registry, lifecycle)
  ctx.effect(() => registry.start(), 'dsh-plugin-market: periodic registry refresh')
  for (const route of api.routes()) {
    ctx.effect(() => ctx.webServer.register(route), `dsh-plugin-market: ${route.path}`)
  }
}

export * from './core/registry.ts'
export * from './core/profile.ts'
export * from './core/installed-bundle.ts'
export * from './core/managed-state.ts'
export * from './core/profile-lock.ts'
export * from './lifecycle/runner.ts'
export * from './lifecycle/source-resolver.ts'
export * from './lifecycle/service.ts'
export * from './host/api.ts'
export * from './registry/provider.ts'
