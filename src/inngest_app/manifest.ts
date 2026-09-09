/**
 * Typed access to the vendored functions manifest (SSOT).
 *
 * `src/inngest_app/functions.manifest.json` lists every Inngest function in
 * this tree: canonical id, legacy id, triggers, steps, retries, onFailure
 * policy, side effects and — crucially — `control`:
 *   - "spec+code"              registered in registerFunctions.ts and served
 *   - "code-only/unregistered" present in the tree, deliberately NOT served
 *
 * The conformance test (src/__tests__/inngest/manifestConformance.test.ts)
 * fails when code and manifest drift.
 */
import manifestJson from './functions.manifest.json'

export type ManifestControl = 'spec+code' | 'spec-only' | 'code-only/unregistered'

export interface ManifestFunction {
  id: string
  legacy_id: string
  domain: string
  trigger: 'event' | 'cron'
  event: string
  legacy_events: string[]
  cron: string
  tz: string
  file: string
  export: string
  steps: string[]
  retries: number | null
  on_failure: 'admin-telegram' | 'log'
  side_effects: string[]
  guard: string
  safe_probe: boolean
  probe_result: string
  deployed_2026_09_09: boolean
  control: ManifestControl
  notes: string[]
}

export interface FunctionsManifest {
  version: number
  app: { id: string; slug_format: string; served_by: string }
  functions: ManifestFunction[]
}

const manifest = manifestJson as unknown as FunctionsManifest

export function getManifest(): FunctionsManifest {
  return manifest
}

export function getManifestFunctions(): ManifestFunction[] {
  return manifest.functions
}

export function getRegisteredManifestFunctions(): ManifestFunction[] {
  return manifest.functions.filter(f => f.control === 'spec+code')
}

export function getManifestFunction(id: string): ManifestFunction | undefined {
  return manifest.functions.find(f => f.id === id)
}

export function manifestAppId(): string {
  return manifest.app.id
}

/** All event names (canonical + legacy) that have a served listener per manifest. */
export function manifestListenedEvents(): Set<string> {
  const out = new Set<string>()
  for (const f of getRegisteredManifestFunctions()) {
    if (f.event) out.add(f.event)
    for (const e of f.legacy_events ?? []) out.add(e)
  }
  return out
}
