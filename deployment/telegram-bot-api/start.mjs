/**
 * ONE CONTAINER, TWO PORTS, AND IT DIES WHOLE.
 *
 *   8081  telegram-bot-api --local   (the image's own entrypoint, unchanged)
 *   8082  the read-only file endpoint (file-server.mjs)
 *
 * This process starts the Bot API server as a child, serves the files itself,
 * and sweeps old media on a timer. If either half stops, the container exits
 * and Railway restarts it: a Bot API server whose files cannot be read looks
 * healthy to every check while every file a person sends is lost, and a half
 * that dies quietly is worse than a restart.
 *
 * Started as root because the image's entrypoint must `chown` the volume; the
 * Bot API server drops to its own user (`--username`), and this process drops
 * to the same uid right after spawning it, so the file endpoint never runs as
 * root.
 */

import { spawn } from 'node:child_process'
import { createFileServer } from './file-server.mjs'
import { sweepOldMedia } from './sweep.mjs'

const ROOT = process.env.TELEGRAM_WORK_DIR || '/var/lib/telegram-bot-api'
const FILES_PORT = Number(process.env.FILES_PORT || 8082)
// `::` takes the Railway private network, which has been IPv6.
const FILES_HOST = process.env.FILES_HOST || '::'
const TTL_HOURS = Number(process.env.FILES_TTL_HOURS ?? 24)
const RUN_AS = Number(process.env.FILES_UID || 101)

let stopping = false
const api = spawn('/docker-entrypoint.sh', [], { stdio: 'inherit' })
api.on('exit', (code, signal) => {
  if (stopping) process.exit(0)
  console.error(
    `[bot-api] server exited (${signal || code}); stopping the container`
  )
  process.exit(typeof code === 'number' && code !== 0 ? code : 1)
})

const server = createFileServer({
  root: ROOT,
  // Statuses only: a path is a token.
  log: line => {
    if (!line.endsWith(' 200')) console.log(`[files] ${line}`)
  },
})
server.on('error', e => {
  console.error(`[files] cannot serve: ${e.code || e.message}`)
  api.kill('SIGTERM')
  process.exit(1)
})
server.listen(FILES_PORT, FILES_HOST, () => {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    process.setgid(RUN_AS)
    process.setuid(RUN_AS)
  }
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
    server.close()
    // The child's exit ends this process; this is only the backstop.
    setTimeout(() => process.exit(0), 15_000).unref()
  })
}
