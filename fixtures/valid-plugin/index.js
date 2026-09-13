import { writeFileSync } from 'node:fs'

export const name = 'dsh-verified-fixture-plugin'
export const inject = ['webServer']
export function apply(ctx) {
  const marker = process.env.DSH_MARKET_FIXTURE_RUNTIME_FILE
  if (marker !== undefined) writeFileSync(marker, String(process.pid))
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh-market-fixture',
    handler: (_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ pid: process.pid }))
    },
  }))
}
