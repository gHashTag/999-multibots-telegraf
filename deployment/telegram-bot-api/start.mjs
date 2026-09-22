/**
 * ONE CONTAINER, THREE PORTS, AND IT DIES WHOLE.
 *
 *   8081  the Bot API as the services see it: api-proxy.mjs, which lets
 *         through only the bots on this server's allow-list and no `file:/`
 *         value
 *   8082  the read-only file endpoint (file-server.mjs)
 *   8083  telegram-bot-api --local itself (the image's own entrypoint,
 *         unchanged) -- on LOOPBACK, forced here whatever the variables say
 *
 * Why the server is not on the private network itself: the private network is
 * shared with the per-person browser pod, which a person drives and an agent
 * can point at any http(s) address. The server would start a client for any
 * token it is sent and, in `--local` mode, send any file on this disk as a
 * document (api-proxy.mjs has the details). Only the move script, run inside
 * this container, talks to 8083 directly -- it has to, to log a bot in before
 * the allow-list names it.
 *
 * This process starts the Bot API server as a child, serves the proxy and the
 * files itself, and sweeps old media on a timer. If any part stops, the
 * container exits and Railway restarts it: a Bot API server whose files cannot
 * be read looks healthy to every check while every file a person sends is
 * lost, and a half that dies quietly is worse than a restart.
 *
 * Started as root because the image's entrypoint must `chown` the volume; the
 * Bot API server drops to its own user (`--username`), and this process drops
 * to the same uid once both of its ports listen, so neither the proxy nor the
 * file endpoint runs as root.
 */

import { spawn } from 'node:child_process'
import { createApiProxy } from './api-proxy.mjs'
import { createFileServer } from './file-server.mjs'
import { sweepOldMedia } from './sweep.mjs'
import allowedBots from './allowed-bots.cjs'

const ROOT = process.env.TELEGRAM_WORK_DIR || '/var/lib/telegram-bot-api'
// `::` takes the Railway private network, which has been IPv6.
const API_PORT = Number(process.env.API_PORT || 8081)
const API_HOST = process.env.API_HOST || '::'
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 8083)
const FILES_PORT = Number(process.env.FILES_PORT || 8082)
const FILES_HOST = process.env.FILES_HOST || '::'
const TTL_HOURS = Number(process.env.FILES_TTL_HOURS ?? 24)
const RUN_AS = Number(process.env.FILES_UID || 101)

// Read before anything starts: a malformed allow-list variable stops the
// container with the variable's name, instead of serving a list nobody meant.
let fromVariable
try {
  fromVariable = allowedBots.parseAllowedVariable(
    process.env[allowedBots.VARIABLE]
  )
} catch (e) {
  console.error(`[api] ${e.message}; not starting`)
  process.exit(1)
}

let stopping = false
const api = spawn('/docker-entrypoint.sh', [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // Loopback, always: a variable set in the dashboard must not be able to
    // put the unguarded server back on the network.
    TELEGRAM_HTTP_IP_ADDRESS: '127.0.0.1',
    TELEGRAM_HTTP_PORT: String(UPSTREAM_PORT),
  },
})
api.on('exit', (code, signal) => {
  if (stopping) process.exit(0)
  console.error(
    `[bot-api] server exited (${signal || code}); stopping the container`
  )
  process.exit(typeof code === 'number' && code !== 0 ? code : 1)
})

const stopAll = reason => {
  console.error(reason)
  api.kill('SIGTERM')
  process.exit(1)
}

// Statuses only, never paths: a path is a token.
const proxy = createApiProxy({
  upstream: `http://127.0.0.1:${UPSTREAM_PORT}`,
  allowed: allowedBots.allowListWatcher(ROOT, fromVariable),
  log: line => {
    if (!/ [23]\d\d$/.test(line)) console.log(`[api] ${line}`)
  },
})
const files = createFileServer({
  root: ROOT,
  log: line => {
    if (!line.endsWith(' 200')) console.log(`[files] ${line}`)
  },
})
proxy.on('error', e => stopAll(`[api] cannot serve: ${e.code || e.message}`))
files.on('error', e => stopAll(`[files] cannot serve: ${e.code || e.message}`))

const listening = server =>
  new Promise(resolve => server.once('listening', resolve))
proxy.listen(API_PORT, API_HOST)
files.listen(FILES_PORT, FILES_HOST)
Promise.all([listening(proxy), listening(files)]).then(() => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    process.setgid(RUN_AS)
    process.setuid(RUN_AS)
  }
  let inFile = '?'
  try {
    inFile = String(allowedBots.readAllowedBots(ROOT).size)
  } catch {
    // Unreadable is an empty list to the proxy; the count is only a log line.
  }
  console.log(
    `[api] Bot API proxy on [${API_HOST}]:${API_PORT} -> 127.0.0.1:${UPSTREAM_PORT}, ` +
      `allow-list: ${inFile} bot(s) in the file, ${fromVariable.size} in ` +
      `${allowedBots.VARIABLE}, uid ${process.getuid?.()}`
  )
  console.log(
    `[files] read-only file endpoint on [${FILES_HOST}]:${FILES_PORT}, ` +
      `root ${ROOT}, uid ${process.getuid?.()}`
  )
})

if (TTL_HOURS > 0) {
  const sweep = async () => {
    const removed = await sweepOldMedia(ROOT, TTL_HOURS * 3600_000)
    if (removed)
      console.log(`[files] swept ${removed} file(s) older than ${TTL_HOURS} h`)
  }
  setInterval(() => void sweep().catch(() => {}), 3600_000).unref()
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    stopping = true
    api.kill(signal)
    proxy.close()
    files.close()
    // The child's exit ends this process; this is only the backstop.
    setTimeout(() => process.exit(0), 15_000).unref()
  })
}
