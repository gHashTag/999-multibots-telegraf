#!/usr/bin/env node
/**
 * WHICH OF OUR TOOLS ACTUALLY WORK.
 *
 * Written 2026-09-20, after both Inngest MCP servers answered
 * `REST API v2 returned HTTP 401` to every data call while looking perfectly
 * healthy: they connect, they hand over a tool list, and the tools are dead.
 * Nothing in this project could tell the difference, and nobody was watching:
 * the Queen judges issues in `gHashTag/t27` (measured -- her board is a list
 * of issue numbers in that repo), so tool health was never something she
 * could see. She did not miss it. She was never given the sense organ.
 *
 * THIS IS THAT ORGAN. It asks three questions of every configured server,
 * because each has a different failure and they look alike from outside:
 *
 *   1. does it answer at all?          (reachable)
 *   2. does it list its tools?         (a server can connect and expose none)
 *   3. do the tools actually return?   (the 401 case -- listed, and dead)
 *
 * WHAT IT WILL NOT DO. It calls only tools that read: a name beginning with
 * get/list/health/status/whoami/search/read, AND no required arguments. A
 * tool that needs an argument is never guessed at, and a tool that might
 * write is never called to see what happens. The heuristic is stated here
 * rather than hidden, because it is a heuristic: a `get_` tool with a side
 * effect would be called by this, and that is the known limit.
 *
 *   node scripts/mcp-doctor.mjs            # table for a human
 *   node scripts/mcp-doctor.mjs --json     # machine-readable
 *   node scripts/mcp-doctor.mjs --report   # open/update/close an issue
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawn, execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const JSON_OUT = process.argv.includes('--json')
const REPORT = process.argv.includes('--report')

/**
 * The marker that makes this idempotent. Without it every run opens another
 * issue, and a board full of the same complaint is noise, which is how a
 * board stops being read.
 */
const MARKER = '<!-- mcp-doctor -->'

/**
 * WHAT COUNTS AS "THE SAME COMPLAINT".
 *
 * The card carries the time it was checked, so comparing whole bodies makes
 * every run an edit -- measured on the second run, which rewrote an
 * unchanged card. A board that rewrites itself every few minutes is a board
 * people stop reading. Compare the FINDING instead: which servers, which
 * verdicts, which tools, which errors.
 */
function fingerprint(report) {
  return report.servers
    .filter(s => s.verdict !== 'OK')
    .map(
      s =>
        `${s.name}:${s.verdict}:${s.failed
          .map(f => f.tool + '=' + f.error)
          .sort()
          .join(',')}`
    )
    .sort()
    .join(' | ')
}
const PER_SERVER_MS = 25_000
const READ_ONLY =
  /^(get|list|health|status|whoami|search|read|describe)([_-]|$)/i

/**
 * DECLARED PROBES, for servers whose read-only tools all take arguments.
 *
 * Without one of these a perfectly healthy server is reported UNPROVEN,
 * which is honest but useless -- browseros-neo was, while this very report
 * was being written in it. Each entry names ONE tool that only reads and the
 * smallest arguments it accepts. Adding an entry is a claim that the tool
 * does not write; make it deliberately.
 */
const DECLARED_PROBES = {
  'browseros-neo': {
    tool: 'tabs',
    args: { action: 'list', agentName: 'mcp-doctor' },
  },
}

/** Every server this machine would start for this project, and where from. */
function configuredServers() {
  const out = []
  const project = join(process.cwd(), '.mcp.json')
  if (existsSync(project)) {
    const cfg = JSON.parse(readFileSync(project, 'utf8')).mcpServers || {}
    for (const [name, c] of Object.entries(cfg))
      out.push({ name, scope: 'project', ...c })
  }
  const global = join(homedir(), '.claude.json')
  if (existsSync(global)) {
    const raw = JSON.parse(readFileSync(global, 'utf8'))
    for (const [name, c] of Object.entries(raw.mcpServers || {})) {
      if (!out.some(s => s.name === name))
        out.push({ name, scope: 'global', ...c })
    }
  }
  return out
}

const rpc = (id, method, params) =>
  JSON.stringify(
    params === undefined
      ? { jsonrpc: '2.0', id, method }
      : { jsonrpc: '2.0', id, method, params }
  )

const INIT_PARAMS = {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'mcp-doctor', version: '1' },
}

/* ── HTTP ────────────────────────────────────────────────────────────────── */

async function speakHttp(url, body, sessionId) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      /*
       * No space after the comma: one server refused `application/json,
       * text/event-stream` with a space and answered "Accept must contain
       * both". Measured, not guessed.
       */
      Accept: 'application/json,text/event-stream',
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body,
  })
  const text = await res.text()
  /* A streamed answer arrives as SSE frames; the payload is the last data:. */
  const line = text.includes('data:')
    ? text
        .split('\n')
        .filter(l => l.startsWith('data:'))
        .pop()
        ?.slice(5)
        .trim()
    : text
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    parsed = undefined
  }
  return {
    status: res.status,
    session: res.headers.get('mcp-session-id'),
    parsed,
    raw: text,
  }
}

async function checkHttp(server) {
  const init = await speakHttp(server.url, rpc(1, 'initialize', INIT_PARAMS))
  if (!init.parsed?.result) {
    return {
      reachable: false,
      why: `initialize -> HTTP ${init.status}: ${init.raw.slice(0, 120)}`,
    }
  }
  const listed = await speakHttp(server.url, rpc(2, 'tools/list'), init.session)
  const tools = listed.parsed?.result?.tools || []
  const call = async (name, args) => {
    const r = await speakHttp(
      server.url,
      rpc(3, 'tools/call', { name, arguments: args }),
      init.session
    )
    return r.parsed
  }
  return {
    reachable: true,
    serverInfo: init.parsed.result.serverInfo,
    tools,
    call,
  }
}

/* ── stdio ───────────────────────────────────────────────────────────────── */

async function checkStdio(server) {
  const child = spawn(server.command, server.args || [], {
    env: { ...process.env, ...(server.env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffer = ''
  const waiters = new Map()
  child.stdout.on('data', chunk => {
    buffer += chunk
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line)
        const w = waiters.get(msg.id)
        if (w) {
          waiters.delete(msg.id)
          w(msg)
        }
      } catch {
        /* Log noise on stdout: ignore, the protocol lines still parse. */
      }
    }
  })
  let stderr = ''
  child.stderr.on('data', c => (stderr += c))

  const send = (id, method, params) =>
    new Promise(resolve => {
      const timer = setTimeout(() => resolve(undefined), PER_SERVER_MS)
      waiters.set(id, m => {
        clearTimeout(timer)
        resolve(m)
      })
      child.stdin.write(rpc(id, method, params) + '\n')
    })

  const init = await send(1, 'initialize', INIT_PARAMS)
  if (!init?.result) {
    child.kill()
    return {
      reachable: false,
      why: stderr.trim().slice(0, 160) || 'no answer to initialize',
    }
  }
  const listed = await send(2, 'tools/list')
  return {
    reachable: true,
    serverInfo: init.result.serverInfo,
    tools: listed?.result?.tools || [],
    call: async (name, args) =>
      await send(3 + Math.floor(Math.random() * 1e6), 'tools/call', {
        name,
        arguments: args,
      }),
    close: () => child.kill(),
  }
}

/* ── telling somebody ────────────────────────────────────────────────────── */

const gh = (args, input) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 8 * 1024 * 1024,
  }).trim()

/**
 * WHICH BOARD HEARS ABOUT THIS, AND WHY IT IS NOT THE QUEEN'S.
 *
 * The Queen's board is `gHashTag/t27` and nothing else -- measured from
 * `/queen/public-board`, which names one repo and 1079 cards. Her cards carry
 * a `## Boundary`: the files a bee may touch, IN THAT REPOSITORY. A broken
 * MCP server here is fixed in THIS repository, so a card on her board would
 * name a path no bee of hers can open, and it would sit in `blocked` forever
 * being nobody's.
 *
 * So the card is opened where the fix lives -- and written in her shape, with
 * Context, Current state, Acceptance criteria and Boundary, so that the day
 * she is pointed at this repository it is already a card she can run.
 */
function repoOfCwd() {
  const url = gh([
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '-q',
    '.nameWithOwner',
  ])
  return url
}

function cardBody(report, repo) {
  const broken = report.servers.filter(s => s.verdict !== 'OK')
  const lines = broken.map(s => {
    const head = `- **${s.name}** (${s.transport}, ${s.scope}) — ${s.verdict}, ${s.tools} tools listed`
    const why = s.why ? `\n  - unreachable: ${s.why}` : ''
    const fails = s.failed.map(f => `\n  - \`${f.tool}\` → ${f.error}`).join('')
    return head + why + fails
  })

  return `${MARKER}
<!-- finding: ${fingerprint(report)} -->
# ${broken.length} MCP server(s) answer, list their tools, and the tools do not work

## Context

A server that connects and hands over a tool list looks healthy from every
angle this project had. These do not work: the tools are listed and they fail
when called. Nothing here could tell the difference, so nobody knew.

The Queen could not have caught it either. Her board is \`gHashTag/t27\` and
this is \`${repo}\`, and she is given issues, never tool health. She did not
miss it — she has no sense for it.

## Current state - re-run these yourself, from the repository root

\`\`\`
npm run mcp:doctor
\`\`\`

${lines.join('\n')}

Checked at ${report.at}.

## Requirements

Each server above must either answer its read-only tools, or be removed from
configuration. A server left configured and broken costs every future session
a tool call, a failure, and a detour.

## Acceptance criteria

  **given** the configuration in \`.mcp.json\` and the global Claude config,
  **when** \`npm run mcp:doctor\` is run from the repository root,
  **then** it prints \`OK\` for every configured server and exits 0.

## Boundary

.mcp.json
scripts/mcp-doctor.mjs
`
}

function tellTheBoard(report) {
  const repo = repoOfCwd()
  const broken = report.servers.filter(
    s => s.verdict === 'DEAD' || s.verdict === 'BROKEN'
  )

  const existing = JSON.parse(
    gh([
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--search',
      'mcp-doctor in:body',
      '--json',
      'number,body',
      '--limit',
      '5',
    ]) || '[]'
  ).find(i => (i.body || '').includes(MARKER))

  if (!broken.length) {
    if (existing) {
      gh([
        'issue',
        'close',
        String(existing.number),
        '--repo',
        repo,
        '--comment',
        'Every configured MCP server answers its read-only tools again. Closed by `npm run mcp:doctor`.',
      ])
      console.log(`closed #${existing.number} in ${repo}: everything answers`)
    } else {
      console.log('nothing to report: every server is healthy')
    }
    return
  }

  const body = cardBody(report, repo)
  if (existing) {
    /* Rewrite only when the FINDING changed; the timestamp alone is not news. */
    const was =
      /<!-- finding: ([\s\S]*?) -->/.exec(existing.body || '')?.[1] ?? ''
    if (was.trim() === fingerprint(report).trim()) {
      console.log(`#${existing.number} already says exactly this; left alone`)
      return
    }
    gh(
      [
        'issue',
        'edit',
        String(existing.number),
        '--repo',
        repo,
        '--body-file',
        '-',
      ],
      body
    )
    console.log(`updated #${existing.number} in ${repo}`)
    return
  }

  const url = gh(
    [
      'issue',
      'create',
      '--repo',
      repo,
      '--title',
      `${broken.length} MCP server(s) list tools that do not work`,
      '--body-file',
      '-',
    ],
    body
  )
  console.log(`opened ${url}`)
}

/* ── the check ───────────────────────────────────────────────────────────── */

function probeableTools(tools, serverName) {
  const declared = DECLARED_PROBES[serverName]
  if (declared) {
    const hit = tools.find(t => t.name === declared.tool)
    if (hit) return [{ ...hit, __args: declared.args }]
  }
  return tools.filter(t => {
    if (!READ_ONLY.test(t.name)) return false
    const required = t.inputSchema?.required || []
    return required.length === 0
  })
}

function verdict(result) {
  if (!result.reachable) return 'DEAD'
  if (!result.tools.length) return 'NO TOOLS'
  if (result.probed === 0) return 'UNPROVEN'
  return result.failed.length ? 'BROKEN' : 'OK'
}

async function main() {
  const servers = configuredServers()
  const report = { at: new Date().toISOString(), servers: [] }

  for (const server of servers) {
    let r
    try {
      r =
        server.type === 'http' || server.url
          ? await checkHttp(server)
          : await checkStdio(server)
    } catch (e) {
      r = { reachable: false, why: String(e).slice(0, 160) }
    }

    const entry = {
      name: server.name,
      scope: server.scope,
      transport: server.url ? 'http' : 'stdio',
      reachable: r.reachable,
      why: r.why,
      tools: (r.tools || []).length,
      probed: 0,
      failed: [],
    }

    for (const tool of probeableTools(r.tools || [], server.name)) {
      entry.probed++
      try {
        const answer = await r.call(tool.name, tool.__args || {})
        const err =
          answer?.error?.message ||
          (answer?.result?.isError
            ? String(answer.result.content?.[0]?.text || 'isError')
            : null)
        if (err)
          entry.failed.push({ tool: tool.name, error: err.slice(0, 140) })
      } catch (e) {
        entry.failed.push({ tool: tool.name, error: String(e).slice(0, 140) })
      }
    }
    r.close?.()

    entry.verdict = verdict({
      ...r,
      probed: entry.probed,
      failed: entry.failed,
    })
    report.servers.push(entry)
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`\nMCP doctor — ${report.at}\n`)
    for (const s of report.servers) {
      const head = `${s.verdict.padEnd(9)} ${s.name.padEnd(18)} ${s.transport.padEnd(6)} ${s.scope.padEnd(8)}`
      console.log(
        `${head} tools: ${String(s.tools).padStart(3)}  probed: ${String(s.probed).padStart(2)}  failing: ${s.failed.length}`
      )
      if (s.why) console.log(`          ↳ ${s.why}`)
      for (const f of s.failed) console.log(`          ✗ ${f.tool}: ${f.error}`)
    }
    const broken = report.servers.filter(s => s.verdict !== 'OK')
    console.log(
      `\n${report.servers.length} configured · ${report.servers.length - broken.length} healthy · ${broken.length} not\n`
    )
  }
  if (REPORT) {
    try {
      tellTheBoard(report)
    } catch (e) {
      console.error('could not reach the board:', String(e).slice(0, 200))
    }
  }

  /* A broken tool is a finding, not a crash: exit 1 so CI can notice. */
  process.exit(
    report.servers.some(s => s.verdict === 'DEAD' || s.verdict === 'BROKEN')
      ? 1
      : 0
  )
}

main().catch(e => {
  console.error('mcp-doctor failed:', e)
  process.exit(2)
})
