/**
 * THE BOT API PORT, AND THE DOOR IN FRONT OF IT.
 *
 * `telegram-bot-api` itself listens on loopback only (start.mjs forces it);
 * what the private network reaches on 8081 is this proxy. It exists because
 * "private network only" is not a boundary in this project: the per-person
 * browser pod is a Railway service on the same network, its Chromium has no
 * egress filter, a person drives it from the mini app and an agent can open
 * any http(s) address in it. Two things are refused before a request reaches
 * the server:
 *
 *   1. ANY BOT NOT ON THIS SERVER'S ALLOW-LIST. The server starts a client for
 *      any token it is sent, a throwaway bot from BotFather included. The
 *      allow-list is the file allowed-bots.cjs describes, written only by the
 *      move script inside this container, plus the ids in this service's
 *      BOT_API_ALLOWED_IDS (the move without a shell). The path must be exactly
 *      `/bot<id>:<secret>/<method>`; `/` alone is passed through so the
 *      services can see the server is up.
 *
 *   2. ANY `file:/` VALUE. In `--local` mode a send method accepts
 *      `file:///any/path` as the file to send (Client.cpp, get_input_file:
 *      `begins_with(file_id, "file:/")` -> inputFileLocal). Nothing of ours
 *      sends a path on THIS disk -- the services run in other containers --
 *      so every such value is either a mistake or somebody reading
 *      `tqueue.binlog` (the pending updates of every bot here) or another
 *      bot's session through a bot of their own. Refused wherever it can
 *      hide: the query string, a JSON or urlencoded body, a text part of a
 *      multipart body, a string nested in a JSON parameter (InputMedia), and
 *      under percent or JSON escapes.
 *
 * HOW THE MULTIPART CHECK AVOIDS BEING OUT-PARSED
 *
 * A proxy that parses a body differently from the server it guards can be
 * walked around: hide a field from the proxy, and the server still sees it.
 * So the scanner below follows the server's own parser (tdnet HttpReader:
 * parts end at the first `\r\n--<boundary>`, a part is a FILE exactly when its
 * Content-Disposition carries a `filename` key) and is STRICTER everywhere the
 * server is lenient -- no prologue, no folded or duplicate headers, no unknown
 * disposition keys, nothing after the closing boundary. What it accepts, the
 * server reads the same way; what it is unsure of, it refuses. The body is
 * forwarded as it arrives, but each chunk only after the scanner has passed
 * it, so a refused part never reaches the server whole: its closing boundary
 * is in the chunk that is held back, and the upstream request is torn down.
 *
 * Logs statuses and reasons, never paths or bodies: a path is a token.
 */

import { createServer, request as httpRequest } from 'node:http'

/** tdnet's MAX_TOTAL_PARAMETERS_LENGTH: the server refuses more anyway. */
const MAX_ARGS_BYTES = 1 << 20
const MAX_PART_HEADER_BYTES = 16 * 1024

const BOT_PATH = /^\/bot(\d{1,20}):[A-Za-z0-9_-]{30,}\/[A-Za-z]{1,64}$/

const JSON_TYPE = /^application\/json\s*(;\s*charset=utf-8\s*)?$/i
const FORM_TYPE =
  /^application\/x-www-form-urlencoded\s*(;\s*charset=utf-8\s*)?$/i
const MULTIPART_TYPE =
  /^multipart\/form-data\s*;\s*boundary=("?)([A-Za-z0-9_.-]{1,70})\1\s*$/i

/**
 * Does this text carry a `file:/` value the server could act on?
 *
 * Decoded until it stops changing -- percent escapes, JSON `\uXXXX`, `\/`,
 * `\"` and `\\` -- because a value may be escaped once for the query string
 * and again inside a JSON parameter. Then a `file:/` counts where a value
 * STARTS: at the very beginning, after `=` (a query or urlencoded value) or
 * after `"` (a JSON string). Over-decoding can only add matches, never hide
 * one; the cost is refusing a message whose own text quotes "file:/...".
 */
export function refersToLocalFile(raw) {
  let text = String(raw ?? '')
  for (let round = 0; ; round++) {
    const next = text
      .replace(/%([0-9a-fA-F]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      )
      .replace(/\\(["\\/])/g, '$1')
    if (next === text) break
    // Eight layers of escaping is not a message, it is an attempt.
    if (round >= 8) return true
    text = next
  }
  return /(^|[="])\s*file:\//i.test(text)
}

/**
 * Spaces only. String.prototype.trim also removes U+00A0 and friends, which
 * the server's trim keeps -- and a key the two read differently is a key one
 * of them ignores: ` filename` behind a no-break space would be a file to the
 * proxy and a text field (unchecked) to the server.
 */
const trimSpaces = text => text.replace(/^ +| +$/g, '')

/** Content-Type -> what the body is, or null when it is refused. */
export function bodyKind(contentType) {
  const value = trimSpaces(String(contentType ?? ''))
  if (JSON_TYPE.test(value)) return { kind: 'args' }
  if (FORM_TYPE.test(value)) return { kind: 'args' }
  const m = MULTIPART_TYPE.exec(value)
  if (m) return { kind: 'multipart', boundary: m[2] }
  return null
}

/**
 * The headers of one multipart part -> { isFile } or a reason to refuse.
 * The Content-Disposition parameters are read the way tdnet reads them (key
 * up to the next `=`, then a quoted string with backslash escapes or a token
 * up to `;`), and anything it would merely ignore is refused here.
 */
export function readPartHeaders(block) {
  const seen = new Set()
  let disposition = null
  for (const line of block.split('\r\n')) {
    if (/[\x00-\x1f\x7f]/.test(line))
      return 'a control character in a part header'
    const colon = line.indexOf(':')
    if (colon <= 0) return 'a malformed part header'
    const name = line.slice(0, colon).toLowerCase()
    if (!/^[a-z0-9-]+$/.test(name)) return 'a malformed part header name'
    if (seen.has(name)) return `a repeated ${name} header`
    seen.add(name)
    const value = trimSpaces(line.slice(colon + 1))
    if (name === 'content-disposition') disposition = value
    else if (name !== 'content-type') return `an unexpected part header ${name}`
  }
  if (disposition === null) return 'a part without Content-Disposition'
  if (!disposition.startsWith('form-data;'))
    return 'a part that is not form-data'

  const keys = new Map()
  let rest = disposition.slice('form-data;'.length)
  for (;;) {
    rest = trimSpaces(rest)
    if (!rest) break
    const eq = rest.indexOf('=')
    if (eq < 0) return 'a disposition parameter without a value'
    const key = trimSpaces(rest.slice(0, eq))
    rest = rest.slice(eq + 1).replace(/^ +/, '')
    let value
    if (rest.startsWith('"')) {
      let i = 1
      value = ''
      for (;;) {
        if (i >= rest.length) return 'an unclosed quoted string'
        let c = rest[i++]
        if (c === '"') break
        if (c === '\\') {
          if (i >= rest.length) return 'a broken escape'
          c = rest[i++]
        }
        value += c
      }
      rest = rest.slice(i).replace(/^ +/, '')
      if (rest) {
        if (rest[0] !== ';') return "a missing ';' in Content-Disposition"
        rest = rest.slice(1)
      }
    } else {
      const semi = rest.indexOf(';')
      value = trimSpaces(semi < 0 ? rest : rest.slice(0, semi))
      rest = semi < 0 ? '' : rest.slice(semi + 1)
    }
    if (key !== 'name' && key !== 'filename') {
      return `an unexpected disposition parameter ${JSON.stringify(key.slice(0, 20))}`
    }
    if (keys.has(key)) return `a repeated ${key}`
    keys.set(key, value)
  }
  if (!keys.get('name')) return 'a part without a name'
  return { isFile: keys.has('filename') }
}

/**
 * Streaming multipart check. push(chunk) and end() return null while the
 * body is acceptable, or the reason it is not.
 */
export class MultipartScanner {
  constructor(boundary) {
    this.delimiter = Buffer.from(`\r\n--${boundary}`, 'latin1')
    // A virtual CRLF in front: the body's first `--<boundary>` is then found
    // exactly like every later delimiter, and must stand at byte 0.
    this.buf = Buffer.from('\r\n', 'latin1')
    this.state = 'start'
    this.isFile = false
    this.value = []
    this.valueSize = 0
    this.failure = null
  }

  fail(reason) {
    this.failure = reason
    return reason
  }

  push(chunk) {
    if (this.failure) return this.failure
    this.buf = Buffer.concat([this.buf, chunk])
    return this.run()
  }

  end() {
    if (this.failure) return this.failure
    const pending = this.run()
    if (pending) return pending
    return this.state === 'epilogue' ? null : this.fail('a truncated body')
  }

  keepValue(bytes) {
    if (this.isFile || !bytes.length) return null
    this.valueSize += bytes.length
    if (this.valueSize > MAX_ARGS_BYTES)
      return this.fail('a text part too large')
    this.value.push(bytes)
    return null
  }

  run() {
    for (;;) {
      if (this.state === 'start') {
        if (this.buf.length < this.delimiter.length) return null
        if (
          !this.buf.subarray(0, this.delimiter.length).equals(this.delimiter)
        ) {
          return this.fail('a body that does not begin with its boundary')
        }
        this.buf = this.buf.subarray(this.delimiter.length)
        this.state = 'after-delimiter'
      } else if (this.state === 'after-delimiter') {
        if (this.buf.length < 2) return null
        const two = this.buf.subarray(0, 2).toString('latin1')
        this.buf = this.buf.subarray(2)
        if (two === '\r\n') this.state = 'headers'
        else if (two === '--') this.state = 'epilogue'
        else return this.fail('a boundary followed by something else')
      } else if (this.state === 'headers') {
        const at = this.buf.indexOf('\r\n\r\n', 0, 'latin1')
        if (at < 0) {
          if (this.buf.length > MAX_PART_HEADER_BYTES) {
            return this.fail('part headers too long')
          }
          return null
        }
        const parsed = readPartHeaders(
          this.buf.subarray(0, at).toString('latin1')
        )
        if (typeof parsed === 'string') return this.fail(parsed)
        this.buf = this.buf.subarray(at + 4)
        this.isFile = parsed.isFile
        this.value = []
        this.valueSize = 0
        this.state = 'body'
      } else if (this.state === 'body') {
        const at = this.buf.indexOf(this.delimiter)
        if (at < 0) {
          // Keep only what could be the start of a delimiter split across
          // chunks; everything before it is settled.
          const keep = this.delimiter.length - 1
          if (this.buf.length > keep) {
            const settled = this.buf.subarray(0, this.buf.length - keep)
            if (this.keepValue(settled)) return this.failure
            this.buf = this.buf.subarray(this.buf.length - keep)
          }
          return null
        }
        if (this.keepValue(this.buf.subarray(0, at))) return this.failure
        if (!this.isFile) {
          const text = Buffer.concat(this.value).toString('latin1')
          if (refersToLocalFile(text)) return this.fail('a file:/ value')
        }
        this.buf = this.buf.subarray(at + this.delimiter.length)
        this.state = 'after-delimiter'
      } else {
        // epilogue: at most the CRLF most clients end with.
        const rest = this.buf.toString('latin1')
        if (rest === '' || rest === '\r' || rest === '\r\n') return null
        return this.fail('data after the closing boundary')
      }
    }
  }
}

function refuse(res, status, description) {
  if (res.headersSent) {
    res.destroy()
    return
  }
  const body = JSON.stringify({ ok: false, error_code: status, description })
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    Connection: 'close',
  })
  res.end(body)
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'proxy-connection',
  'upgrade',
])

/**
 * @param {object} o
 * @param {string} o.upstream     the server on loopback, e.g. http://127.0.0.1:8083
 * @param {() => Set<string>} o.allowed  ids of the bots this server may serve
 * @param {(line: string) => void} [o.log]
 */
export function createApiProxy({ upstream, allowed, log = () => {} }) {
  const target = new URL(upstream)

  const server = createServer((req, res) => {
    const url = req.url || '/'
    const q = url.indexOf('?')
    const pathname = q < 0 ? url : url.slice(0, q)
    const query = q < 0 ? '' : url.slice(q + 1)
    // Once this request has an answer -- ours or the server's -- nothing
    // else may write one.
    let settled = false
    const done = (status, why = '') =>
      log(`${req.method} ${status}${why ? ` (${why})` : ''}`)
    const deny = (status, description, why) => {
      if (settled) return
      settled = true
      refuse(res, status, description)
      done(status, why)
      // Drain what the client is still sending; it is not forwarded.
      req.resume()
    }

    const liveness = pathname === '/'
    if (liveness) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return deny(405, 'Method Not Allowed', 'method')
      }
    } else {
      const m = BOT_PATH.exec(pathname)
      if (!m) return deny(404, 'Not Found', 'path')
      if (!allowed().has(m[1])) {
        return deny(
          403,
          `Forbidden: bot ${m[1]} is not on this server's allow-list ` +
            '(bot-api-move.cjs --apply, or BOT_API_ALLOWED_IDS on this service, ' +
            'adds a bot when it moves here)',
          'not listed'
        )
      }
      if (req.method !== 'GET' && req.method !== 'POST') {
        return deny(405, 'Method Not Allowed', 'method')
      }
      if (refersToLocalFile(query)) {
        return deny(
          400,
          'Bad Request: file:/ values are refused here',
          'file:/'
        )
      }
    }

    const length = req.headers['content-length']
    const hasBody =
      !liveness &&
      (req.headers['transfer-encoding'] !== undefined ||
        (length !== undefined && length !== '0'))
    const kind = hasBody ? bodyKind(req.headers['content-type']) : null
    if (hasBody && !kind) {
      return deny(415, 'Unsupported Media Type', 'content-type')
    }

    // Only the headers the server needs, built here: a second Content-Type
    // the proxy never read cannot ride along.
    const headers = {}
    if (hasBody) {
      headers['content-type'] = req.headers['content-type']
      if (length !== undefined) headers['content-length'] = length
    }

    const up = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: liveness ? '/' : url,
        headers,
      },
      upRes => {
        if (settled) {
          upRes.resume()
          return
        }
        settled = true
        const out = {}
        for (const [k, v] of Object.entries(upRes.headers)) {
          if (!HOP_BY_HOP.has(k)) out[k] = v
        }
        res.writeHead(upRes.statusCode || 502, out)
        upRes.pipe(res)
        upRes.on('end', () => done(upRes.statusCode || 502))
      }
    )
    up.on('error', () => {
      if (!settled) {
        settled = true
        refuse(res, 502, 'Bad Gateway: our Bot API server does not answer')
        done(502, 'upstream')
        req.resume()
      } else if (!res.writableEnded) {
        res.destroy()
      }
    })
    res.on('close', () => {
      if (!res.writableFinished) up.destroy()
    })

    if (!hasBody) {
      req.resume()
      up.end()
      return
    }

    if (kind.kind === 'args') {
      // Small by definition (the server's own cap is 1 MiB): read whole,
      // check, then send.
      const chunks = []
      let size = 0
      req.on('data', chunk => {
        size += chunk.length
        if (size <= MAX_ARGS_BYTES) chunks.push(chunk)
      })
      req.on('end', () => {
        if (settled) return
        if (size > MAX_ARGS_BYTES) {
          up.destroy()
          return deny(413, 'Request Entity Too Large', 'size')
        }
        const body = Buffer.concat(chunks)
        if (refersToLocalFile(body.toString('latin1'))) {
          up.destroy()
          return deny(
            400,
            'Bad Request: file:/ values are refused here',
            'file:/'
          )
        }
        if (length === undefined) up.setHeader('content-length', body.length)
        up.end(body)
      })
      return
    }

    const scanner = new MultipartScanner(kind.boundary)
    req.on('data', chunk => {
      if (settled) return
      const why = scanner.push(chunk)
      if (why) {
        // This chunk -- which holds the end of the refused part -- is never
        // sent: the server is left with a request it cannot complete.
        up.destroy()
        return deny(400, `Bad Request: multipart refused here: ${why}`, why)
      }
      if (!up.write(chunk)) {
        req.pause()
        up.once('drain', () => req.resume())
      }
    })
    req.on('end', () => {
      if (settled) return
      const why = scanner.end()
      if (why) {
        up.destroy()
        return deny(400, `Bad Request: multipart refused here: ${why}`, why)
      }
      up.end()
    })
  })

  // Uploads here may be 2000 MB and long polls hold a request for a minute:
  // no whole-request deadline. Headers still have to arrive promptly.
  server.requestTimeout = 0
  return server
}
