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
  await writeFile(outside, 'secret outside the root')
  await symlink(outside, path.join(root, MOVED, 'videos', 'escape.mp4'))

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

  it('a health line for the platform', async () => {
    expect(await (await get('/healthz')).text()).toBe('ok')
  })
})

describe('what it never hands over', () => {
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
