// End-to-end smoke for the reels MCP V1 server over real stdio.
// Usage: node scripts/reels-mcp-smoke.mjs <path-to-server-js-or-ts-runner> [command]
// Default command is node; pass "bun" to run the TypeScript source directly.
// The publish assertions are the law: reels_publish must answer its dry-run
// body without confirm, and must stay BLOCKED with confirm, with or without
// a syntactically valid API key. Any UNEXPECTED line fails the smoke.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = process.argv[2] ?? 'dist/reels-mcp/main.js'
const command = process.argv[3] ?? 'node'
const runDir = mkdtempSync(join(tmpdir(), 'reels-smoke-'))
let failures = 0
const check = (label, ok, detail) => {
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` -- ${detail}` : ''}`
  )
  if (!ok) failures += 1
}
const parse = result => JSON.parse(result.content[0].text)

async function withServer(env, fn) {
  const transport = new StdioClientTransport({
    command,
    args: command === 'bun' ? [target] : [target],
    cwd: process.cwd(),
    env: { ...process.env, REELS_RUN_DIR: runDir, ...env },
  })
  const client = new Client({ name: 'reels-smoke', version: '1.0.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

await withServer({}, async client => {
  const tools = await client.listTools()
  const names = tools.tools.map(t => t.name).sort()
  check(
    'tools/list returns the five tools',
    JSON.stringify(names) ===
      JSON.stringify([
        'reels_assets',
        'reels_brief',
        'reels_publish',
        'reels_render',
        'reels_storyboard',
      ]),
    names.join(',')
  )

  const brief = parse(
    await client.callTool({
      name: 'reels_brief',
      arguments: {
        topic: 'a short noir reel about the t27 spec language',
        seconds: 15,
      },
    })
  )
  check(
    'brief: 15s gives 3 scenes',
    brief.scenes === 3,
    `scenes=${brief.scenes} perSceneMs=${brief.per_scene_ms}`
  )
  check('brief: duration_ok', brief.duration_ok === true)

  const sb = parse(
    await client.callTool({
      name: 'reels_storyboard',
      arguments: { brief_id: brief.brief_id },
    })
  )
  check(
    'storyboard: one scene per beat',
    sb.scene_count === brief.scenes,
    `scenes=${sb.scene_count}`
  )
  check(
    'storyboard: every scene has a visual prompt',
    sb.scenes.every(
      s => typeof s.visualPrompt === 'string' && s.visualPrompt.length > 0
    )
  )

  const assets = parse(
    await client.callTool({
      name: 'reels_assets',
      arguments: { storyboard_id: sb.storyboard_id },
    })
  )
  check(
    'assets: placeholder per scene',
    assets.assets.length === sb.scene_count &&
      assets.assets.every(a => a.status === 'placeholder-v1')
  )

  const dry = parse(
    await client.callTool({
      name: 'reels_render',
      arguments: { storyboard_id: sb.storyboard_id },
    })
  )
  check(
    'render: dry-run by default, nothing written',
    dry.dry_run === true && !existsSync(dry.would_write)
  )

  const exec = parse(
    await client.callTool({
      name: 'reels_render',
      arguments: {
        storyboard_id: sb.storyboard_id,
        dry_run: false,
        confirm: true,
      },
    })
  )
  check(
    'render: executes with dry_run=false + confirm',
    exec.executed === true && existsSync(exec.manifest_path),
    exec.manifest_path
  )

  const pub1 = parse(
    await client.callTool({
      name: 'reels_publish',
      arguments: { render_id: exec.render_id },
    })
  )
  check(
    'publish: no confirm answers the dry-run body',
    pub1.dry_run === true && pub1.blocked === undefined
  )

  const pub2 = parse(
    await client.callTool({
      name: 'reels_publish',
      arguments: { render_id: exec.render_id, confirm: true },
    })
  )
  check(
    'publish: confirm=true stays BLOCKED',
    pub2.blocked === true && pub2.stage === 'owner-approval-required',
    pub2.reason
  )

  const badSeconds = parse(
    await client.callTool({
      name: 'reels_brief',
      arguments: { topic: 'too short', seconds: 3 },
    })
  )
  check(
    'brief: seconds outside the spec window rejected',
    typeof badSeconds.rejected === 'string',
    badSeconds.rejected
  )

  const dirty = parse(
    await client.callTool({
      name: 'reels_brief',
      arguments: { topic: 'deployment rollback is manual', seconds: 10 },
    })
  )
  check(
    'brief: forbidden term rejected without echoing it',
    typeof dirty.rejected === 'string' && !dirty.rejected.includes('rollback')
  )

  const unknown = await client.callTool({ name: 'no_such_tool', arguments: {} })
  check('unknown tool answered as an error', unknown.isError === true)
})

// Second server instance with an unwritable run dir: three consecutive
// failures must open the circuit breaker, the next call must be refused
// with a retry hint, and recovery must close it again.
await withServer(
  { REELS_RUN_DIR: '/proc/reels-non-writable' },
  async client => {
    const brief = parse(
      await client.callTool({
        name: 'reels_brief',
        arguments: { topic: 'breaker probe', seconds: 10 },
      })
    )
    const sb = parse(
      await client.callTool({
        name: 'reels_storyboard',
        arguments: { brief_id: brief.brief_id },
      })
    )
    let refusal = null
    for (let i = 0; i < 3; i += 1) {
      const r = parse(
        await client.callTool({
          name: 'reels_render',
          arguments: {
            storyboard_id: sb.storyboard_id,
            dry_run: false,
            confirm: true,
          },
        })
      )
      if (typeof r.error === 'string') refusal = r.error
    }
    check(
      'breaker: three failures produce write errors',
      refusal !== null && refusal.includes('manifest write failed')
    )
    const fourth = parse(
      await client.callTool({
        name: 'reels_render',
        arguments: {
          storyboard_id: sb.storyboard_id,
          dry_run: false,
          confirm: true,
        },
      })
    )
    check(
      'breaker: fourth call refused by the open breaker',
      typeof fourth.rejected === 'string' &&
        fourth.rejected.includes('circuit breaker is open'),
      fourth.rejected
    )
  }
)

console.log(failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures})`)
process.exit(failures === 0 ? 0 : 1)
