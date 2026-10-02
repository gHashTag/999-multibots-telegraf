/**
 * tri growth -- the Queen's next best action to earn, for the owner.
 *
 * Calls the render's own tool `hive_growth` through /mcp as the owner, the
 * same door `tri ball show` uses. Read-only: the tool sends nothing and
 * promises no sum (spec automation/queen-growth.t27).
 */
const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER_TG = '144022504'

type Growth = {
  action: string
  say: string
  how: string
  measured: Record<string, number | null>
}

async function main(): Promise<void> {
  const key = process.env.RENDER_API_KEY || ''
  if (!key) {
    console.log('🛑 no render key -- nothing read')
    process.exit(2)
  }
  const r = await fetch(`${BASE}/mcp?telegram_id=${OWNER_TG}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'hive_growth', arguments: {} },
    }),
  })
  const body = (await r.json()) as {
    error?: { message?: string }
    result?: {
      isError?: boolean
      structuredContent?: Growth
      content?: Array<{ text?: string }>
    }
  }
  if (body?.error || !body?.result || body.result.isError)
    throw new Error(
      `hive_growth: ${body?.error?.message ?? body?.result?.content?.[0]?.text ?? 'no result'}`
    )
  const g: Growth =
    body.result.structuredContent ??
    JSON.parse(String(body.result.content?.[0]?.text ?? '{}'))
  console.log(`  next: ${g.action}`)
  console.log(`  ${g.say}`)
  console.log(`  ${g.how}`)
  for (const [k, v] of Object.entries(g.measured ?? {}))
    console.log(`    ${k.padEnd(20)} ${v ?? 'unknown'}`)
}

main().catch(e => {
  console.error(String(e?.message ?? e))
  process.exit(1)
})
