#!/usr/bin/env node
// tri online [--wait SECONDS] [--json] -- can this Mac reach what a loop needs,
// and when it cannot, is that the network (wait) or a refusal (look)?
//
//   tri online             GitHub (dns, git over ssh, the API), App Store
//                          Connect, the render service; one line each
//   tri online --wait 300  poll GitHub every 15 s until it answers or the time
//                          is up -- run it before retrying a failed push
//
// Exit: 0 all up, 1 the network is down, 3 GitHub refuses the credentials,
// 4 a failure not recognised, 2 bad usage. The meaning is scripts/lib/online.cjs.
import { spawn, spawnSync } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { createRequire } from 'node:module'

const { classify, reason, verdict } = createRequire(import.meta.url)(
  '../../scripts/lib/online.cjs'
)

const args = process.argv.slice(2)
let wait = 0
let json = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') json = true
  else if (args[i] === '--wait' && /^\d+$/.test(args[i + 1] || ''))
    wait = Number(args[++i])
  else {
    console.error('usage: tri online [--wait SECONDS] [--json]')
    process.exit(2)
  }
}

const RENDER =
  process.env.TRI_RENDER_URL || 'https://vibee-render-production.up.railway.app'

// BatchMode turns a password prompt into a refusal, ConnectTimeout bounds a
// dead road; both are added to the ssh command already chosen (environment,
// then core.sshCommand), so a custom key path is kept (#3442 review).
// Computed once. Without git on PATH spawnSync gives no stdout: that must not
// throw, or the crash exits 1 and reads as "the network is down" (#3444 review).
function sshCommand() {
  const base =
    process.env.GIT_SSH_COMMAND ||
    spawnSync('git', ['config', '--get', 'core.sshCommand'], {
      encoding: 'utf8',
    }).stdout?.trim() ||
    'ssh'
  return `${base} -o BatchMode=yes -o ConnectTimeout=10`
}
const SSH_COMMAND = sshCommand()

function run(cmd, argv, ms) {
  return new Promise(resolve => {
    let out = ''
    let done = false
    const p = spawn(cmd, argv, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_SSH_COMMAND: SSH_COMMAND,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const finish = (status, extra = '') => {
      if (done) return
      done = true
      clearTimeout(t)
      resolve({ status, text: out + extra })
    }
    const t = setTimeout(() => {
      p.kill('SIGKILL')
      finish(124, ' timed out')
    }, ms)
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (out += d))
    p.on('error', e => finish(127, String(e.message)))
    p.on('close', code => finish(code ?? 124))
  })
}

async function dnsProbe(host) {
  try {
    await Promise.race([
      lookup(host),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('getaddrinfo timed out')), 8000)
      ),
    ])
    return { status: 0, text: '' }
  } catch (e) {
    return { status: 1, text: `${e.code || ''} ${e.message}` }
  }
}

// Any HTTP answer means the road is open; whether the service is well is
// the service's own question (App Store Connect says 401 without a token).
async function httpProbe(url, wantOk) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      redirect: 'manual',
    })
    if (!wantOk || r.ok) return { status: 0, text: `http ${r.status}` }
    return { status: 1, text: `http ${r.status}` }
  } catch (e) {
    const c = e.cause || {}
    return {
      status: 1,
      text: `${c.code || ''} ${c.message || ''} ${e.name} ${e.message}`,
    }
  }
}

const GITHUB = {
  'github-dns': () => dnsProbe('github.com'),
  'git-ssh': () =>
    run('git', ['ls-remote', '--exit-code', 'origin', 'HEAD'], 25000),
  'github-api': () =>
    run('gh', ['api', 'rate_limit', '-q', '.rate.remaining'], 20000),
}
const OTHERS = {
  'app-store-connect': () =>
    httpProbe('https://api.appstoreconnect.apple.com/v1/apps', false),
  render: () => httpProbe(`${RENDER}/health`, true),
}

async function probe(set) {
  const names = Object.keys(set)
  const raw = await Promise.all(names.map(n => set[n]()))
  const out = {}
  names.forEach((n, i) => {
    out[n] = {
      kind: classify(raw[i].status, raw[i].text),
      text: reason(raw[i].text),
    }
  })
  return out
}

let results = await probe({ ...GITHUB, ...OTHERS })
const started = Date.now()
const githubUp = r => Object.keys(GITHUB).every(n => r[n].kind === 'up')
// A refusal does not heal by waiting: stop polling at once (#3442 review).
const refused = r => Object.keys(GITHUB).some(n => r[n].kind === 'auth')
while (
  wait > 0 &&
  !githubUp(results) &&
  !refused(results) &&
  Date.now() - started < wait * 1000
) {
  if (!json)
    console.log(
      `  …    GitHub not answering (${Object.keys(GITHUB)
        .map(n => `${n} ${results[n].kind}`)
        .join(', ')}); again in 15 s`
    )
  await new Promise(r => setTimeout(r, 15000))
  results = { ...results, ...(await probe(GITHUB)) }
}

const v = verdict(
  Object.fromEntries(Object.entries(results).map(([n, r]) => [n, r.kind]))
)
if (json) {
  console.log(
    JSON.stringify({
      ...v,
      results,
      waited_s: Math.round((Date.now() - started) / 1000),
    })
  )
} else {
  for (const [n, r] of Object.entries(results)) {
    const mark = r.kind === 'up' ? '  OK  ' : '  ✗   '
    console.log(
      `${mark} ${n.padEnd(18)} ${r.kind}${r.kind === 'up' ? '' : `  (${r.text})`}`
    )
  }
  console.log(`  next: ${v.next}`)
}
process.exit(v.code)
