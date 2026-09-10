import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

// Router mount auth-boundary (security config-drift).
//
// api_server/index.ts mounts internal routers behind the requireInternalKey
// middleware (their ONLY authentication -- billing and diagnostic expose money
// data), and mounts provider-webhook routers WITHOUT it on purpose (external
// callers can't hold the internal key; each such route self-authenticates --
// verifyCallbackToken, a Robokassa signature, or a DB-existence gate). #1434
// showed the risk of that split: a route in a public router can silently miss
// per-route auth. This ratchet pins the boundary the other way: every router
// mounted WITHOUT requireInternalKey must be an explicitly reviewed public
// router. A new public mount -- or requireInternalKey being dropped from a
// protected one -- fails here until reviewed and registered with WHY it is safe
// to be reachable without the internal key.
//
// Each entry records the per-route authentication that makes the public mount
// safe. Verified during the iter172 webhook-auth audit.
const KNOWN_PUBLIC: Record<string, string> = {
  healthRouter:
    'GET-only health/root checks; no money/delivery/DB-write side effects',
  robokassaRouter:
    'payment callback validates Robokassa SignatureValue (400 on mismatch) BEFORE updateUserBalance(MONEY_INCOME)',
  githubAutoFixerRouter:
    'applies requireInternalKey PER-ROUTE inside the router (github-autofixer.routes.ts)',
  kieAiWebhookRouter:
    'provider callbacks self-auth via verifyCallbackToken (fail-closed, timing-safe); debug endpoints NODE_ENV-gated (#1434)',
  aiReelsCallbackRouter:
    'render callback self-auth via verifyCallbackToken per route',
  replicateWebhookRouter:
    'no signature yet (webhook secret is owner/infra) but rejects unknown replicate_training_id before inngest.send; the consumer function is unregistered today',
  competitorRouter: 'endpoints are 501 stubs; no side effects',
  inngestStatusRouter:
    'GET/OPTIONS only (design inngest-spec-first §3.8: the t27.ai Functions tab reads it); read-only manifest × Inngest GraphQL counters, 30 s cache, CORS allow-list; no mutation is reachable. Residual disclosure, named: run ids, last-error event names and the internal gqlUrl are visible to anyone',
}

const idText = (e: ts.Expression): string => (ts.isIdentifier(e) ? e.text : '')

interface Mount {
  router: string
  protected: boolean
}

// Exported so the self-check can exercise it on a synthetic snippet.
export function routerMounts(fileName: string, text: string): Mount[] {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const mounts: Mount[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'use' &&
      idText(node.expression.expression) === 'app'
    ) {
      const args = node.arguments
      const last = args[args.length - 1]
      const routerName = last ? idText(last) : ''
      // A router mount is app.use(path, [middleware...], <xRouter>).
      if (/Router$/.test(routerName)) {
        const isProtected = args.some(a => idText(a) === 'requireInternalKey')
        mounts.push({ router: routerName, protected: isProtected })
      }
    }
    node.forEachChild(visit)
  }
  visit(sf)
  return mounts
}

describe('router mount auth boundary (public routers are an explicit allowlist)', () => {
  it('detector separates protected from public mounts (control can fail)', () => {
    const snippet = [
      "app.use('/', healthRouter)",
      "app.use('/api', requireInternalKey, billingRouter)",
      "app.use('/api', express.json())",
      "app.use('/api/inngest', inngestHandler)",
    ].join('\n')
    const m = routerMounts('synthetic.ts', snippet)
    expect(m).toEqual([
      { router: 'healthRouter', protected: false },
      { router: 'billingRouter', protected: true },
    ])
  })

  const indexFile = path.join(__dirname, '..', '..', 'api_server', 'index.ts')
  const mounts = routerMounts(indexFile, fs.readFileSync(indexFile, 'utf8'))

  it('finds the router mounts (matcher is not stale)', () => {
    expect(mounts.length).toBeGreaterThanOrEqual(8)
    // Positive control: a known-protected router is detected as protected, so a
    // broken requireInternalKey check cannot make everything look public.
    expect(mounts.find(m => m.router === 'billingRouter')?.protected).toBe(true)
  })

  it('every public (non-requireInternalKey) router is a reviewed allowlist entry', () => {
    const unexpectedPublic = mounts
      .filter(m => !m.protected)
      .filter(m => !(m.router in KNOWN_PUBLIC))
      .map(m => m.router)
    expect(
      unexpectedPublic,
      `Router mounted WITHOUT requireInternalKey and not in KNOWN_PUBLIC. Either ` +
        `it must be protected (add requireInternalKey in index.ts), or it is ` +
        `intentionally public -- add it to KNOWN_PUBLIC with the per-route auth ` +
        `that makes it safe:\n` +
        unexpectedPublic.map(r => `  ${r}`).join('\n')
    ).toEqual([])
  })
})
