/**
 * THE READ-ONLY FILE ENDPOINT OF OUR BOT API SERVER.
 *
 * In `--local` mode `telegram-bot-api` answers `getFile` with an ABSOLUTE path
 * on its own disk -- `/var/lib/telegram-bot-api/<token>/videos/file_3.mp4` --
 * and serves no file downloads over HTTP at all. The bot and the render run in
 * other containers, so they need a way to read that path. This is it: GET (and
 * HEAD) of exactly that absolute path, and nothing else.
 *
 * WHAT IT REFUSES, AND WHY EACH ONE MATTERS
 *
 *   - Anything outside the working directory (traversal, symlinks out).
 *   - Directories. A listing of the working directory is a list of every bot
 *     TOKEN on the server -- its subdirectories are named by them. A directory
 *     answers 404 exactly like a missing file, so not even existence leaks.
 *   - Every method but GET and HEAD. It never writes, renames or deletes.
 *
 * WHERE IT LISTENS
 *
 * On the Railway PRIVATE network only: the service gets no public domain
 * (deployment/telegram-bot-api/README.md). Every path it serves contains a bot
 * token, the same exposure as the Bot API port beside it -- which is why
 * neither is ever published.
 *
 * It logs statuses, never paths: a path is a token.
 *
 * Plain node, no dependencies: it runs inside the Bot API image.
 */

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

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
  const wanted = '/' + decoded.join('/')
  const base = path.resolve(root)
  if (!wanted.startsWith(base + '/')) return null

  // A symlink inside the directory must not lead out of it.
  let real
  let realBase
  try {
    real = await realpath(wanted)
    realBase = await realpath(base)
  } catch {
    return null
  }
  if (!real.startsWith(realBase + '/')) return null
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
