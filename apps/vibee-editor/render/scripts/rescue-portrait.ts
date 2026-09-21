/**
 * RESCUE A PORTRAIT THAT WAS PAID FOR AND LOST.
 *
 * Before 2026-09-21 a GPT Image 2.5 portrait slower than the turn's wait was
 * refused and forgotten while Kie went on to finish it. The picture exists on
 * Kie's temporary host and nowhere else. This runs the SAME recovery path the
 * next delivery runs (crm_portrait_rescue in src/agent/crm-deliver-tool.ts):
 * ask Kie about the task, copy the finished file to our storage and the
 * seller's gallery, and put it on the lead's debt -- so the next card for
 * that lead carries it, without a new task and without a charge.
 *
 * It goes through the render's own /mcp, so it runs inside the service that
 * owns the storage and the database; nothing here touches either directly.
 * The tool is owner-only: the agent key must belong to the platform owner.
 *
 *   SELF_URL=https://<render host> AGENT_KEY=<the owner's agent key> \
 *     npx tsx scripts/rescue-portrait.ts --task <32 hex> --lead <telegram id> [--seller <telegram id>]
 *
 * Instead of AGENT_KEY: AGENT_KEYS ("key:id,key:id") plus OWNER_TELEGRAM_ID,
 * and the pair for the owner is picked. The key is never printed.
 */

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? String(process.argv[i + 1] ?? '').trim() : ''
}

function ownerKey(): string {
  if (process.env.AGENT_KEY) return process.env.AGENT_KEY.trim()
  const owner = String(process.env.OWNER_TELEGRAM_ID ?? '').trim()
  const pairs = String(process.env.AGENT_KEYS ?? '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
  const mine = pairs.find(p => owner && p.endsWith(`:${owner}`))
  return mine ? mine.slice(0, mine.lastIndexOf(':')) : ''
}

async function main(): Promise<number> {
  const task = arg('task').toLowerCase()
  const lead = arg('lead')
  const seller = arg('seller')
  if (!/^[0-9a-f]{32}$/.test(task) || !/^\d{5,15}$/.test(lead)) {
    console.error(
      'usage: rescue-portrait.ts --task <32 hex> --lead <telegram id> [--seller <telegram id>]'
    )
    return 2
  }
  if (seller && !/^\d{5,15}$/.test(seller)) {
    console.error('--seller must be a numeric telegram id')
    return 2
  }
  const base = String(process.env.SELF_URL ?? '').replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) {
    console.error('SELF_URL (the render service URL) is not set')
    return 2
  }
  const key = ownerKey()
  if (!key) {
    console.error(
      "no agent key for the owner: set AGENT_KEY, or AGENT_KEYS with the owner's pair and OWNER_TELEGRAM_ID"
    )
    return 2
  }
  const r = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': key },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'crm_portrait_rescue',
        arguments: { task_id: task, lead, ...(seller ? { seller } : {}) },
      },
    }),
  })
  const body: any = await r.json().catch(() => null)
  if (!r.ok || !body || body.error) {
    console.error(
      `rescue failed: HTTP ${r.status} ${String(body?.error?.message ?? '').slice(0, 300)}`
    )
    return 1
  }
  const out = body.result?.structuredContent ?? body.result
  console.log(JSON.stringify(out, null, 2))
  return out?.rescued === true || out?.still_drawing === true ? 0 : 1
}

main().then(
  code => process.exit(code),
  e => {
    console.error(String((e as Error)?.message ?? e).slice(0, 300))
    process.exit(1)
  }
)
