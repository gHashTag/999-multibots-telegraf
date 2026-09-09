/**
 * Manifest ⇄ registry conformance (design: inngest-spec-first §3.7).
 *
 * The manifest (src/inngest_app/functions.manifest.json) is the SSOT. This
 * test fails when the served registry drifts from it:
 *   - every registered function has a manifest entry with control "spec+code"
 *   - id, triggers (canonical + legacy), retries and onFailure presence match
 *   - no "spec+code" manifest entry is missing from the registry
 *   - no "code-only/unregistered" entry is registered (nothing is served silently)
 *   - canonical event names are unique and the naming scheme holds
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { allInngestFunctions } from '@/inngest_app/registerFunctions'
import {
  getManifest,
  getManifestFunctions,
  getRegisteredManifestFunctions,
} from '@/inngest_app/manifest'

type AnyFn = {
  opts: {
    id: string
    retries?: number
    onFailure?: unknown
    triggers?: Array<{ event?: string; cron?: string }>
  }
}

const registry = allInngestFunctions as unknown as AnyFn[]
const byId = new Map(registry.map(f => [f.opts.id, f]))

function triggersOf(fn: AnyFn): { events: string[]; crons: string[] } {
  const t = fn.opts.triggers ?? []
  return {
    events: t.map(x => x.event).filter((x): x is string => !!x),
    crons: t.map(x => x.cron).filter((x): x is string => !!x),
  }
}

describe('functions.manifest.json ⇄ registerFunctions', () => {
  const manifest = getManifest()
  const registered = getRegisteredManifestFunctions()

  it('manifest app id matches the Inngest client id', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/inngest_app/client.ts'),
      'utf8'
    )
    expect(src).toContain(`id: '${manifest.app.id}'`)
  })

  it('every registered function has a spec+code manifest entry', () => {
    const manifestIds = new Set(registered.map(f => f.id))
    const missing = registry
      .map(f => f.opts.id)
      .filter(id => !manifestIds.has(id))
    expect(missing, 'registered but not in manifest (spec+code)').toEqual([])
  })

  it('every spec+code manifest entry is registered', () => {
    const missing = registered.map(f => f.id).filter(id => !byId.has(id))
    expect(missing, 'in manifest (spec+code) but not registered').toEqual([])
  })

  it('no code-only/unregistered entry is served', () => {
    const leaked = getManifestFunctions()
      .filter(f => f.control === 'code-only/unregistered')
      .map(f => f.id)
      .filter(id => byId.has(id))
    expect(leaked).toEqual([])
  })

  it.each(registered.map(f => [f.id, f] as const))(
    '%s: triggers, retries, onFailure match the manifest',
    (_id, m) => {
      const fn = byId.get(m.id)!
      expect(fn, `not registered: ${m.id}`).toBeDefined()
      const { events, crons } = triggersOf(fn)

      if (m.trigger === 'event') {
        // canonical first, then legacy — order is part of the contract
        expect(events).toEqual([m.event, ...m.legacy_events])
        expect(crons).toEqual([])
      } else {
        expect(crons).toEqual([m.cron])
        expect(events).toEqual([])
      }

      // retries: null in the manifest = SDK default (no `retries` declared)
      expect(fn.opts.retries ?? null).toBe(m.retries)

      const hasOnFailure = !!fn.opts.onFailure
      expect(hasOnFailure, `onFailure presence for ${m.id}`).toBe(
        m.on_failure === 'admin-telegram'
      )
    }
  )

  it('manifest file paths exist and define the id', () => {
    const bad: string[] = []
    for (const m of getManifestFunctions()) {
      const p = path.resolve(process.cwd(), m.file)
      if (!fs.existsSync(p)) {
        bad.push(`${m.id}: missing file ${m.file}`)
        continue
      }
      const src = fs.readFileSync(p, 'utf8')
      const idLiteral = `'${m.id}'`
      const legacyLiteral = `'${m.legacy_id}'`
      if (!src.includes(idLiteral) && !src.includes(legacyLiteral)) {
        bad.push(`${m.id}: id literal not found in ${m.file}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('canonical ids and events are unique and follow the naming scheme', () => {
    const ids = registered.map(f => f.id)
    expect(new Set(ids).size).toBe(ids.length)

    const events = registered.flatMap(f => (f.event ? [f.event] : []))
    expect(new Set(events).size).toBe(events.length)

    // id: kebab-case `<domain>-<object>-<verb>` (2..5 segments), no uppercase
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+){1,4}$/)
    }
    // canonical event: `<domain>/<object>.<verb>` (object may be kebab)
    for (const ev of events) {
      expect(ev).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+\.[a-z0-9-]+$/)
    }
  })

  it('functions that charge, call paid APIs or message users have onFailure', () => {
    const RISKY = new Set(['charges-balance', 'paid-api', 'messages-users'])
    const missing = registered
      .filter(m => (m.side_effects ?? []).some(s => RISKY.has(s)))
      .filter(m => m.on_failure !== 'admin-telegram')
      .map(m => `${m.id} (${m.side_effects.join(',')})`)
    expect(missing).toEqual([])
  })
})
