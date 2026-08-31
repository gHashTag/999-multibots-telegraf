import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Unauthenticated-debug-endpoint class (security, money).
//
// The webhook routers are mounted WITHOUT the requireInternalKey middleware
// (external providers call them and self-authenticate per route via
// verifyCallbackToken -- fail-closed, timing-safe). Debug/test endpoints in
// those same routers authenticate NEITHER: no internal key, no callback token.
// A live example (fixed alongside this ratchet): POST /api/kie-ai/sora-full-test
// took an arbitrary telegramId and called processSoraWebhookAsync directly,
// delivering a video to any user AND charging their balance
// (chargeForDeliveredVideo) -- fully unauthenticated.
//
// The mitigation is to gate every such debug endpoint out of production:
// `if (process.env.NODE_ENV !== 'development') return res.status(404)...`.
// This ratchet forces it: any route in src/api_server/routes whose path names
// it a test/debug endpoint must reference process.env.NODE_ENV in its handler.
// A NEW ungated debug endpoint fails here.
//
// The check walks the TS AST (the handler node's own text), not a file-wide
// window -- the robustness lesson from #1431/#1432.

const DEBUG_PATH = /(^|[/-])(test|debug)([/-]|$)/i // path segment named test/debug

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return e.isFile() && p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : []
  })

const calleeChain = (e: ts.Expression): string => {
  if (ts.isIdentifier(e)) return e.text
  if (ts.isPropertyAccessExpression(e))
    return `${calleeChain(e.expression)}.${e.name.text}`
  return ''
}

interface Route {
  routePath: string
  gated: boolean
}

// Exported so the self-check can exercise it on a synthetic snippet.
export function debugRoutes(fileName: string, text: string): Route[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const routes: Route[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const chain = calleeChain(node.expression)
      const method = node.expression.name.text
      const isRoute =
        /^(router|app)$/.test(chain.split('.')[0]) &&
        ['get', 'post', 'put', 'delete', 'patch'].includes(method)
      const first = node.arguments[0]
      if (
        isRoute &&
        first &&
        ts.isStringLiteral(first) &&
        DEBUG_PATH.test(first.text)
      ) {
        // The handler is the last argument (the request handler function).
        const handler = node.arguments[node.arguments.length - 1]
        const handlerText = handler ? handler.getText(sf) : ''
        routes.push({
          routePath: first.text,
          gated: handlerText.includes('process.env.NODE_ENV'),
        })
      }
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return routes
}

describe('every debug/test HTTP route is gated out of production (unauthenticated-endpoint class)', () => {
  it('detector distinguishes gated from ungated (control can fail)', () => {
    const snippet = [
      'const router = { post: (p: string, h: any) => {} } as any',
      "router.post('/thing-test', async (req: any, res: any) => {",
      "  if (process.env.NODE_ENV !== 'development') return res.status(404).end()", // gated
      '  res.json({ ok: true })',
      '})',
      "router.post('/other-test', async (req: any, res: any) => {", // ungated
      '  res.json({ ok: true })',
      '})',
      "router.post('/normal-route', async (req: any, res: any) => {", // not a debug route
      '  res.json({ ok: true })',
      '})',
    ].join('\n')
    const found = debugRoutes('synthetic.ts', snippet)
    expect(found.map(r => `${r.routePath}:${r.gated}`)).toEqual([
      '/thing-test:true',
      '/other-test:false',
    ])
  })

  const routesDir = path.join(__dirname, '..', '..', 'api_server', 'routes')

  const all = walk(routesDir).flatMap(f =>
    debugRoutes(f, fs.readFileSync(f, 'utf8')).map(r => ({
      file: f.slice(routesDir.length + 1),
      ...r,
    }))
  )

  it('finds the known debug routes (matcher is not stale)', () => {
    // sora-callback-test, sora-full-test, test-training -- if this drops the
    // matcher drifted and the invariant below would pass vacuously.
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it('has no ungated debug route (each references NODE_ENV)', () => {
    const ungated = all.filter(r => !r.gated)
    expect(
      ungated,
      `Debug/test HTTP route with no production gate (an unauthenticated request ` +
        `can reach it; add \`if (process.env.NODE_ENV !== 'development') return ` +
        `res.status(404)...\`):\n` +
        ungated.map(r => `  ${r.file}  ${r.routePath}`).join('\n')
    ).toEqual([])
  })
})
