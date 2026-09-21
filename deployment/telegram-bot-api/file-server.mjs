/**
 * THE READ-ONLY FILE ENDPOINT OF OUR BOT API SERVER.
 *
 * In `--local` mode `telegram-bot-api` answers `getFile` with an ABSOLUTE path
 * on its own disk -- `/var/lib/telegram-bot-api/<token>/videos/file_3.mp4` --
 * and serves no file downloads over HTTP at all. The bot and the render run in
 * other containers, so they need a way to read that path. This is it: GET (and
 * HEAD) of exactly that shape of path, and nothing else.
 *
 * AN ALLOW-LIST OF ONE SHAPE, NOT A DENY-LIST OF BAD PATHS
 *
 * The first version served any regular file under the working directory and
 * reasoned that "every path contains a token". It does not. The server keeps
 * files of its own at the ROOT of that directory, at fixed, well-known names,
 * and reading them takes no token at all:
 *
 *   tqueue.binlog        the pending updates of EVERY bot on the server --
 *                        messages, business chats, payments
 *   webhooks_db.binlog   keyed by bot TOKEN
 *
 * (ClientManager.cpp: `working_directory_ + "tqueue.binlog"`, `+
 * "webhooks_db.binlog"`.) And each bot's own directory holds its session --
 * `td.binlog`, `db.sqlite` -- whose auth key is the bot.
 *
 * So what is served is exactly what `getFile` can answer, and nothing that
 * merely happens to live nearby:
 *
 *   <root>/<one bot directory>/<one media directory>/<file>
 *
 * The bot directory must be token-shaped (the server names it by the token,
 * with `:` or `~`); the media directory must be one of MEDIA_DIRS, the same
 * list the sweep deletes from (sweep.mjs); the file sits directly inside it.
 * Everything else answers 404 -- the root files, the session files, a
 * directory (a listing of the root would be a list of every token), anything
 * outside the root, and any path through a symlink.
 *
 * Every method but GET and HEAD is refused. It never writes, renames or
 * deletes.
 *
 * WHERE IT LISTENS
 *
 * On the Railway private network only: the service gets no public domain
 * (deployment/telegram-bot-api/README.md). The private network is NOT a
 * boundary by itself -- the per-person browser pod sits on it too -- which is
 * why the shape above is the rule and not "the network is private". Every path
 * it serves now contains a bot token, so reading a file takes the token.
 *
 * It logs statuses, never paths: a path is a token.
 *
 * Plain node, no dependencies: it runs inside the Bot API image.
 */

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { MEDIA_DIRS } from './sweep.mjs'

/**
 * A bot's directory: the token, with the colon kept or turned into `~` (the
 * server does that where a file system refuses colons), and `:T`/`~T` for the
 * test environment. Nothing else lives in the root under this shape.
 */
const BOT_DIR = /^\d{1,20}[:~][A-Za-z0-9_-]{30,}([:~]T)?$/
const MEDIA = new Set(MEDIA_DIRS)

/**
 * The absolute file a request names, or null when it names nothing we serve.
 * Pure string work plus one realpath: no side effects.
 */
export async function resolveRequestPath(root, rawUrl) {
  let pathname
  try {
    pathname = new URL(rawUrl, 'http://files.invalid').pathname
  } catch {
    return null
  }
  const segments = pathname.split('/').slice(1)
  const decoded = []
  for (const segment of segments) {
    let part
    try {
      part = decodeURIComponent(segment)
    } catch {
      return null
    }
    if (
      part === '' ||
      part === '.' ||
      part === '..' ||
      part.includes('/') ||
      part.includes('\\') ||
      part.includes('\0')
    ) {
      return null
    }
    decoded.push(part)
  }

  // Exactly <root>/<bot>/<media>/<file>: three segments below the root.
  // The server reports paths under the REAL working directory (it calls
  // realpath on --dir at startup), so the root is matched as configured or
  // as resolved.
  const base = path.resolve(root)
  let realBase
  try {
    realBase = await realpath(base)
  } catch {
    return null
  }
  let rest = null
  for (const candidate of [base, realBase]) {
    const prefix = candidate.split('/').filter(Boolean)
    if (prefix.every((segment, i) => decoded[i] === segment)) {
      rest = decoded.slice(prefix.length)
      break
    }
  }
  if (!rest || rest.length !== 3) return null
  const [bot, kind, name] = rest
  if (!BOT_DIR.test(bot) || !MEDIA.has(kind)) return null

  // No symlink anywhere on the way: the real path must BE the path asked
  // for. A link in a bot's directory could otherwise lead to the root files
  // or out of the directory altogether.
  let real
  try {
    real = await realpath(path.join(realBase, bot, kind, name))
  } catch {
    return null
  }
  if (real !== path.join(realBase, bot, kind, name)) return null
  return real
}

/** A reader that copies the bytes elsewhere keeps a sensible type. */
const TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
}

export function createFileServer({ root, log = () => {} }) {
  return createServer(async (req, res) => {
    const done = status => log(`${req.method} ${status}`)

    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' })
      res.end()
      done(405)
      return
    }

    const file = await resolveRequestPath(root, req.url || '/')
    let info = null
    if (file) {
      try {
        info = await stat(file)
      } catch {
        info = null
      }
    }
    if (!file || !info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('not found')
      done(404)
      return
    }

    res.writeHead(200, {
      'Content-Type':
        TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': String(info.size),
      'Cache-Control': 'no-store',
    })
    if (req.method === 'HEAD') {
      res.end()
      done(200)
      return
    }
    // Streamed: a file here may be 2000 MB, and this process holds one chunk.
    const stream = createReadStream(file)
    stream.on('error', () => res.destroy())
    stream.pipe(res)
    res.on('finish', () => done(200))
  })
}
