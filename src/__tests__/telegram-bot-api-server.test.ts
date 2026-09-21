import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  utimes,
  readdir,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
// @ts-ignore -- plain .mjs shipped in the Bot API image, no types
import {
  createFileServer,
  resolveRequestPath,
} from '../../deployment/telegram-bot-api/file-server.mjs'
// @ts-ignore -- plain .mjs shipped in the Bot API image, no types
import { sweepOldMedia } from '../../deployment/telegram-bot-api/sweep.mjs'

/**
 * THE FILE ENDPOINT OF OUR BOT API SERVER, AGAINST A REAL DIRECTORY.
 *
 * It lays the working directory out the way telegram-bot-api does -- one
 * directory per bot, NAMED BY ITS TOKEN -- and asks the server for the things
 * it must hand over and the things it must never hand over. A listing of the
 * root would be a list of every token on the server.
 */
const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const TILDE = '900000022~ZZtildetildetildetildetildetildetil'
const OTHER = '900000033:ZZotherotherotherotherotherotherother'

let root = ''
let outside = ''
let server: Server
let base = ''

beforeAll(async () => {
  const top = await mkdtemp(path.join(tmpdir(), 'bot-api-files-'))
  root = path.join(top, 'work')
  outside = path.join(top, 'outside.txt')
  await mkdir(path.join(root, MOVED, 'videos'), { recursive: true })
  await writeFile(
    path.join(root, MOVED, 'videos', 'file_0.mp4'),
    Buffer.alloc(70_000, 3)
  )
  await writeFile(path.join(root, MOVED, 'td.binlog'), 'session')
  await writeFile(path.join(root, MOVED, 'db.sqlite'), 'session db')
  // The server's own files, at the ROOT, at names anybody can know. They take
  // no token to name: tqueue.binlog holds the pending updates of every bot,
  // webhooks_db.binlog is keyed by token.
  await writeFile(path.join(root, 'tqueue.binlog'), 'every pending update')
  await writeFile(path.join(root, 'webhooks_db.binlog'), `${MOVED} -> hook`)
  // Media-shaped, but not where getFile ever points.
  await mkdir(path.join(root, MOVED, 'passport'), { recursive: true })
  await writeFile(path.join(root, MOVED, 'passport', 'file_1.jpg'), 'id')
  await mkdir(path.join(root, 'not-a-token', 'videos'), { recursive: true })
  await writeFile(path.join(root, 'not-a-token', 'videos', 'x.mp4'), 'x')
  // The same server where colons are refused names the directory with `~`.
  await mkdir(path.join(root, TILDE, 'photos'), { recursive: true })
  await writeFile(path.join(root, TILDE, 'photos', 'file_2.jpg'), 'photo')
  await writeFile(outside, 'secret outside the root')
  await symlink(outside, path.join(root, MOVED, 'videos', 'escape.mp4'))
  // A link that stays INSIDE the root and leads to the server's own files.
  await mkdir(path.join(root, OTHER), { recursive: true })
  await symlink(root, path.join(root, OTHER, 'documents'))

  server = createFileServer({ root })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
  await rm(path.dirname(root), { recursive: true, force: true })
})

const get = (p: string, init?: RequestInit) => fetch(`${base}${p}`, init)

describe('what it hands over', () => {
  it('the absolute path getFile answered, whole, with its length', async () => {
    const res = await get(`${root}/${MOVED}/videos/file_0.mp4`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('70000')
    expect((await res.arrayBuffer()).byteLength).toBe(70_000)
  })

  it('HEAD: the length without the body', async () => {
    const res = await get(`${root}/${MOVED}/videos/file_0.mp4`, {
      method: 'HEAD',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('70000')
  })

  it('the `~` spelling of a bot directory, as the server writes it where colons are refused', async () => {
    const res = await get(`${root}/${TILDE}/photos/file_2.jpg`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('photo')
  })

  it('a health line for the platform', async () => {
    expect(await (await get('/healthz')).text()).toBe('ok')
  })
})

describe('what it never hands over', () => {
  it("the server's own files at the root -- they take no token to name", async () => {
    for (const name of ['tqueue.binlog', 'webhooks_db.binlog']) {
      const res = await get(`${root}/${name}`)
      expect(res.status, name).toBe(404)
      expect(await res.text(), name).not.toContain(MOVED)
    }
  })

  it("a bot's session: td.binlog and db.sqlite are the bot, not media", async () => {
    for (const name of ['td.binlog', 'db.sqlite']) {
      expect((await get(`${root}/${MOVED}/${name}`)).status, name).toBe(404)
    }
  })

  it('media-shaped paths getFile never answers: a kind outside the list, a directory not named by a token, one level too deep', async () => {
    await mkdir(path.join(root, MOVED, 'videos', 'deeper'), { recursive: true })
    await writeFile(path.join(root, MOVED, 'videos', 'deeper', 'y.mp4'), 'y')
    for (const p of [
      `${root}/${MOVED}/passport/file_1.jpg`,
      `${root}/not-a-token/videos/x.mp4`,
      `${root}/${MOVED}/videos/deeper/y.mp4`,
      // A real file, with a segment after it: not the path of that file.
      `${root}/${MOVED}/videos/file_0.mp4/extra`,
    ]) {
      expect((await get(p)).status, p).toBe(404)
    }
  })

  it('a link inside the root that leads back to its own files', async () => {
    for (const name of ['tqueue.binlog', 'webhooks_db.binlog']) {
      const p = `${root}/${OTHER}/documents/${name}`
      expect((await get(p)).status, p).toBe(404)
      expect(await resolveRequestPath(root, p)).toBeNull()
    }
  })

  it('a directory -- the root is a list of tokens -- answers 404 like a missing file', async () => {
    for (const p of [
      root,
      `${root}/`,
      `${root}/${MOVED}`,
      `${root}/${MOVED}/videos`,
    ]) {
      const res = await get(p)
      expect(res.status, p).toBe(404)
      expect(await res.text()).not.toContain(MOVED)
    }
  })

  it('anything outside the working directory, however it is spelled', async () => {
    for (const p of [
      '/etc/passwd',
      `${root}/../outside.txt`,
      `${root}/%2e%2e/outside.txt`,
      `${root}/${MOVED}/videos/..%2F..%2F..%2Foutside.txt`,
      `${root}-sibling/x`,
    ]) {
      expect((await get(p)).status, p).toBe(404)
    }
  })

  it('a symlink that leads out of the directory', async () => {
    expect((await get(`${root}/${MOVED}/videos/escape.mp4`)).status).toBe(404)
    expect(
      await resolveRequestPath(root, `${root}/${MOVED}/videos/escape.mp4`)
    ).toBeNull()
  })

  it('every method but GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const res = await get(`${root}/${MOVED}/videos/file_0.mp4`, { method })
      expect(res.status, method).toBe(405)
    }
    // Still there after the DELETE.
    expect((await get(`${root}/${MOVED}/videos/file_0.mp4`)).status).toBe(200)
  })
})

describe('the sweep keeps the volume from filling', () => {
  it('removes old media and nothing else', async () => {
    const top = await mkdtemp(path.join(tmpdir(), 'bot-api-sweep-'))
    const bot = path.join(top, MOVED)
    await mkdir(path.join(bot, 'videos'), { recursive: true })
    await mkdir(path.join(bot, 'documents'), { recursive: true })
    const old = path.join(bot, 'videos', 'old.mp4')
    const fresh = path.join(bot, 'documents', 'fresh.pdf')
    const binlog = path.join(bot, 'td.binlog')
    for (const f of [old, fresh, binlog]) await writeFile(f, 'x')
    const now = Date.now()
    const twoDaysAgo = new Date(now - 48 * 3600_000)
    await utimes(old, twoDaysAgo, twoDaysAgo)
    await utimes(binlog, twoDaysAgo, twoDaysAgo)

    expect(await sweepOldMedia(top, 24 * 3600_000, now)).toBe(1)
    expect(await readdir(path.join(bot, 'videos'))).toEqual([])
    expect(await readdir(path.join(bot, 'documents'))).toEqual(['fresh.pdf'])
    // The session database is never media, however old.
    expect((await readdir(bot)).sort()).toEqual([
      'documents',
      'td.binlog',
      'videos',
    ])

    expect(await sweepOldMedia(top, 0, now)).toBe(0)
    await rm(top, { recursive: true, force: true })
  })
})
