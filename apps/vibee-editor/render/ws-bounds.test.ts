import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * What an anonymous WebSocket peer may cost us.
 *
 * This socket sits outside the HTTP auth guard on purpose -- a browser cannot
 * set headers on `new WebSocket(url)` and the editor connects cross-origin, so
 * authenticating it needs a ticket or a subprotocol, which is the owner's
 * design call. Until then the peer is anonymous, and the only thing standing
 * between it and the process every bot shares is that each cost is bounded.
 *
 * Four bounds, and each is asserted here because each was absent:
 *   a frame cap (ws defaults to 100 MB; this editor sends kilobytes),
 *   a client cap (the set only shrank on close/error),
 *   a liveness sweep (a half-open socket may emit neither event, ever),
 *   a backlog check before send (queueing for a stalled peer costs OUR memory).
 *
 * Source-level: render-server.ts cannot be imported without booting the whole
 * service. Every assertion below is mutation-checked -- reverting the bound
 * turns it red -- and the ORDER assertions matter most: a cap applied after the
 * client is already in the set, or a backlog check after send(), is a comment
 * rather than a guard.
 */

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/** The WebSocket section: from the server construction to the export. */
function wsSection(): string {
  const start = SERVER.indexOf('new WebSocketServer(')
  expect(start, 'WebSocketServer not found').toBeGreaterThan(-1)
  const end = SERVER.indexOf('export { broadcastWS }', start)
  return SERVER.slice(start, end === -1 ? start + 6000 : end)
}

describe('анонимный peer ограничен в цене', () => {
  it('находит секцию — иначе проверка пустая', () => {
    expect(wsSection().length).toBeGreaterThan(500)
    expect(wsSection()).toContain('wsClients')
  })

  it('размер кадра ограничен (иначе 100 МБ по умолчанию)', () => {
    expect(wsSection()).toMatch(/maxPayload:\s*WS_MAX_PAYLOAD_BYTES/)
    expect(SERVER).toMatch(/WS_MAX_PAYLOAD_BYTES\s*=\s*[0-9*_ ]+/)
  })

  it('число клиентов ограничено, и отказ стоит ДО добавления в набор', () => {
    const s = wsSection()
    const cap = s.search(/wsClients\.size\s*>=\s*MAX_WS_CLIENTS/)
    const add = s.indexOf('wsClients.add(ws)')
    expect(cap, 'нет проверки вместимости').toBeGreaterThan(-1)
    expect(add).toBeGreaterThan(-1)
    // Order is the whole point: capping after the add bounds nothing.
    expect(cap).toBeLessThan(add)
    expect(s).toMatch(/ws\.close\(\s*1013/)
  })

  it('мёртвые соединения выметаются пингом, и таймер не держит процесс', () => {
    const s = wsSection()
    expect(s).toContain('client.ping()')
    expect(s).toMatch(/setInterval\(/)
    expect(s).toContain('wsPingTimer.unref()')
    // A sweep that never terminates anything only counts the dead.
    expect(s).toContain('client.terminate()')
  })

  it('рассылка пропускает отставшего, и проверка стоит ДО send', () => {
    const s = wsSection()
    const body = s.slice(s.indexOf('function broadcastWS'))
    const guard = body.search(/bufferedAmount\s*>\s*WS_MAX_BUFFERED_BYTES/)
    const send = body.indexOf('client.send(data)')
    expect(guard, 'нет проверки очереди').toBeGreaterThan(-1)
    expect(send).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(send)
  })
})
