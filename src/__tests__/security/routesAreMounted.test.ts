import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/**
 * Every file that declares HTTP routes must actually be mounted.
 *
 * A route file that nobody mounts is an endpoint that exists in the source and
 * not on the wire. Reading the code -- or grepping for the path -- says the
 * endpoint is there; a request gets 404. The gap is invisible from either side
 * alone.
 *
 * Found by asking the it.196 question (do two registrations contend for one
 * identifier?) of HTTP routes. Express is the OPPOSITE of Telegraf here: its
 * router walks the stack in order and stops at the first match
 * (`while (match !== true && idx < stack.length)` in node_modules/router), so
 * a duplicate path registered LATER is the dead one, while in Telegraf's Stage
 * -- a Map -- the last registration wins. The rule had to be read in each
 * library rather than assumed from the other.
 *
 * No path collision exists today, but this file does NOT assert that: the
 * mount resolver reaches only part of the surface, and a zero over an
 * incomplete population is worth nothing. What it asserts instead is coverage
 * -- if the resolver stops seeing the mounts it sees today, that is a failure,
 * not a quiet pass.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const ROUTES_DIR = path.join(REPO, 'src', 'api_server', 'routes')
const ENTRY = path.join(REPO, 'src', 'api_server', 'index.ts')

const ROUTE_DECL = /\brouter\.(get|post|put|patch|delete|all)\s*\(/g

/** Route files that declare at least one route. */
function routeFiles(): string[] {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.ts'))
    .filter(
      f =>
        matchCode(fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8'), ROUTE_DECL)
          .length > 0
    )
}

/** Route modules the entry point actually mounts, via app.use(prefix, router). */
function mountedModules(): string[] {
  const raw = fs.readFileSync(ENTRY, 'utf8')
  const imports: Record<string, string> = {}
  // multi-line safe: `import r, {\n  a,\n} from './routes/x.routes'`
  const IMPORT =
    /import\s+(\w+)\s*(?:,\s*\{[\s\S]*?\})?\s*from\s+['"`](\.[^'"`]+)['"`]/g
  for (const m of matchCode(raw, IMPORT)) imports[m[1]] = m[2]
  const mounted: string[] = []
  // EVERY identifier in the call, not the first: a mount often carries
  // middleware between the prefix and the router --
  // `app.use('/api', requireInternalKey, billingRouter)` -- and taking the
  // first argument named the MIDDLEWARE, which made five mounted routers look
  // like orphans.
  for (const m of matchCode(raw, /\.use\(\s*['"`][^'"`]+['"`]\s*,([^)]*)\)/g)) {
    for (const id of m[1].match(/\w+/g) || []) {
      const mod = imports[id]
      if (mod && mod.includes('routes/'))
        mounted.push(path.basename(mod) + '.ts')
    }
  }
  return [...new Set(mounted)]
}

/**
 * Declared but deliberately not mounted, with the reason.
 *
 * These are NOT fixed here: removing a route file is a product decision, and
 * user-registration in particular describes a real surface someone may intend
 * to expose. They are named so the next reader knows the endpoints are dead.
 */
const NOT_MOUNTED: Record<string, string> = {
  'test-training.routes.ts':
    'a test helper that writes to the live database; mounting it would expose that',
  'user-registration.routes.ts':
    'declares /register, /user/:telegram_id, /check-user -- none reachable today',
  'x402.routes.ts':
    'imported for setX402BotInstance but never mounted -- the x402 credit path ' +
    'is unreachable, which is why x402CreditFailClosed currently guards code no ' +
    'request can enter',
}

describe('every route file is mounted, or knowingly is not', () => {
  it('the census sees real route files and real mounts', () => {
    // Zero on either side would make the comparison below vacuous. The mount
    // resolver missed kie-ai-webhook until it handled MULTI-LINE imports, and
    // that gap silently shrank the surface it could judge.
    expect(routeFiles().length).toBeGreaterThan(10)
    expect(mountedModules().length).toBeGreaterThan(6)
  })

  it('no route file declares endpoints that nothing mounts', () => {
    const mounted = new Set(mountedModules())
    const orphans = routeFiles()
      .filter(f => !mounted.has(f))
      .filter(f => !(f in NOT_MOUNTED))
    expect(
      orphans,
      'these files declare HTTP routes that are never mounted, so the endpoints ' +
        'exist in source and return 404 on the wire:\n' +
        orphans.join('\n')
    ).toEqual([])
  })

  it('the known-unmounted list has no stale entry', () => {
    // An entry that survives its reason hides the next orphan.
    const declared = new Set(routeFiles())
    const mounted = new Set(mountedModules())
    const stale = Object.keys(NOT_MOUNTED).filter(
      f => !declared.has(f) || mounted.has(f)
    )
    expect(
      stale,
      'these are no longer unmounted route files -- remove them from the list:\n' +
        stale.join('\n')
    ).toEqual([])
  })
})
