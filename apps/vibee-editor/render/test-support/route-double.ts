import { Readable } from 'node:stream'

/**
 * A REQUEST AND A RESPONSE A ROUTE CAN BE CALLED WITH.
 *
 * The auth routes are exported and perfectly callable, but until now every
 * test that wanted to call one built its own request and its own response
 * double. That is why the source-reading guards multiplied: writing thirty
 * lines of scaffolding to assert one thing is worse than reading the file,
 * so people read the file (form 97).
 *
 * Thirty lines, once, here. Nothing clever -- a readable body, a url, a
 * method, and a response that remembers the status and the parsed json.
 *
 * The pool stays with each test: one simulates launch rows, another sessions,
 * and a shared one would be a fake that decides the answer by the shape of
 * the query, which is the thing these tests exist to avoid.
 */
export interface RouteResponseDouble {
  status: number
  json: unknown
  setHeader(): void
  writeHead(code: number): RouteResponseDouble
  end(body?: string): void
}

/**
 * @param path  the url the route matches on
 * @param body  parsed back from JSON by the route, so pass the object
 * @param opts  `from` distinguishes callers for anything counting per-address
 */
export function routeRequest(
  path: string,
  body: unknown,
  opts: {
    from?: string
    method?: string
    headers?: Record<string, string>
  } = {}
): Readable & {
  url: string
  method: string
  headers: Record<string, string>
  socket: { remoteAddress: string }
} {
  const r = Readable.from([
    Buffer.from(JSON.stringify(body ?? {})),
  ]) as never as Readable & {
    url: string
    method: string
    headers: Record<string, string>
    socket: { remoteAddress: string }
  }
  r.url = path
  r.method = opts.method ?? 'POST'
  r.headers = opts.headers ?? {}
  // A distinct address by default: anything that throttles or counts per
  // caller must not see two unrelated tests as one client.
  r.socket = { remoteAddress: opts.from ?? '10.0.0.1' }
  return r
}

export function routeResponse(): RouteResponseDouble {
  const o: RouteResponseDouble = {
    status: 0,
    json: null,
    setHeader() {},
    writeHead(code: number) {
      o.status = code
      return o
    },
    end(body?: string) {
      o.json = body ? JSON.parse(body) : null
    },
  }
  return o
}
