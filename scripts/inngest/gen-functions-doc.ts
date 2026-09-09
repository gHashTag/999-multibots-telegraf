/**
 * Generate docs/inngest/functions.md from src/inngest_app/functions.manifest.json.
 *
 *   bun run scripts/inngest/gen-functions-doc.ts          # write
 *   bun run scripts/inngest/gen-functions-doc.ts --check  # exit 1 if stale
 *
 * The manifest is the SSOT; never edit functions.md by hand.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..', '..')
const MANIFEST = path.join(ROOT, 'src/inngest_app/functions.manifest.json')
const OUT = path.join(ROOT, 'docs/inngest/functions.md')

type Fn = {
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
  on_failure: string
  side_effects: string[]
  guard: string
  safe_probe: boolean
  probe_result: string
  deployed_2026_09_09: boolean
  control: string
  notes: string[]
}
type Manifest = { version: number; app: { id: string; slug_format: string }; functions: Fn[] }

const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))

function code(s: string): string {
  return s ? `\`${s}\`` : '—'
}

function triggerCell(f: Fn): string {
  if (f.trigger === 'cron') return `cron ${code(f.cron)} (${f.tz || 'UTC'})`
  const legacy = f.legacy_events.length
    ? ` <br>legacy: ${f.legacy_events.map(code).join(', ')}`
    : ''
  return `${code(f.event)}${legacy}`
}

function retriesCell(f: Fn): string {
  return f.retries === null ? 'SDK default (4)' : String(f.retries)
}

function card(f: Fn): string {
  const lines: string[] = []
  lines.push(`### ${f.id}`)
  lines.push('')
  lines.push(`- **Slug:** \`${manifest.app.id}-${f.id}\``)
  if (f.legacy_id && f.legacy_id !== f.id) lines.push(`- **Legacy id:** \`${f.legacy_id}\``)
  lines.push(`- **Control:** \`${f.control}\``)
  lines.push(`- **Domain:** ${f.domain}`)
  lines.push(`- **Trigger:** ${triggerCell(f).replace(' <br>', '; ')}`)
  lines.push(`- **Source:** \`${f.file}\` → \`${f.export}\``)
  lines.push(`- **Retries:** ${retriesCell(f)}`)
  lines.push(`- **onFailure:** ${f.on_failure}`)
  lines.push(`- **Guard:** ${f.guard}`)
  lines.push(`- **Side effects:** ${f.side_effects.length ? f.side_effects.map(code).join(', ') : '—'}`)
  lines.push(`- **Steps:** ${f.steps.length ? f.steps.map(code).join(' → ') : '—'}`)
  lines.push(
    `- **Probe 2026-09-09:** safe=${f.safe_probe ? 'yes' : 'no'}, result=${f.probe_result || '—'}, deployed=${f.deployed_2026_09_09 ? 'yes' : 'no'}`
  )
  if (f.notes.length) {
    lines.push(`- **Notes:**`)
    for (const n of f.notes) lines.push(`  - ${n}`)
  }
  lines.push('')
  return lines.join('\n')
}

function render(): string {
  const served = manifest.functions.filter(f => f.control === 'spec+code')
  const unregistered = manifest.functions.filter(f => f.control !== 'spec+code')
  const out: string[] = []
  out.push('<!-- GENERATED FILE — do not edit. Source: src/inngest_app/functions.manifest.json -->')
  out.push('<!-- Regenerate: bun run scripts/inngest/gen-functions-doc.ts -->')
  out.push('')
  out.push('# Inngest functions')
  out.push('')
  out.push(`App id: \`${manifest.app.id}\` · slug format: \`${manifest.app.slug_format}\` · manifest v${manifest.version}`)
  out.push('')
  out.push(`Served functions: **${served.length}** · code-only/unregistered: **${unregistered.length}**`)
  out.push('')
  out.push('Every served function listens to its canonical event **and** its legacy event,')
  out.push('so existing senders keep working. New code must send the canonical name')
  out.push('(`INNGEST_EVENTS` in `src/inngest_app/client.ts`).')
  out.push('')
  out.push('Live status: `GET /api/inngest/functions/status` (read-only, 30 s cache) or the')
  out.push('MCP tools `inngest_health`, `inngest_functions`, `inngest_failed_runs`.')
  out.push('')
  out.push('## Served functions (control = spec+code)')
  out.push('')
  out.push('| id | trigger | retries | onFailure | guard | side effects | file |')
  out.push('|---|---|---|---|---|---|---|')
  for (const f of served) {
    out.push(
      `| \`${f.id}\` | ${triggerCell(f)} | ${retriesCell(f)} | ${f.on_failure} | ${f.guard} | ${f.side_effects.join(', ') || '—'} | \`${f.file.replace('src/inngest_app/functions/', '')}\` |`
    )
  }
  out.push('')
  out.push('## Code-only / unregistered (never served)')
  out.push('')
  out.push('| id | file | why |')
  out.push('|---|---|---|')
  for (const f of unregistered) {
    out.push(`| \`${f.id}\` | \`${f.file.replace('src/inngest_app/functions/', '')}\` | ${f.notes.join('; ')} |`)
  }
  out.push('')
  out.push('## Function cards')
  out.push('')
  for (const f of served) out.push(card(f))
  out.push('## Unregistered cards')
  out.push('')
  for (const f of unregistered) out.push(card(f))
  return out.join('\n')
}

const content = render()
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (current !== content) {
    console.error('docs/inngest/functions.md is stale — run: bun run scripts/inngest/gen-functions-doc.ts')
    process.exit(1)
  }
  console.log('docs/inngest/functions.md is up to date')
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, content)
  console.log(`wrote ${path.relative(ROOT, OUT)} (${manifest.functions.length} functions)`)
}
