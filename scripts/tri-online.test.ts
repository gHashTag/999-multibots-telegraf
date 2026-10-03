/**
 * tri online: network down (wait) vs refused (look), told apart from the
 * probes' own words (scripts/lib/online.cjs, bin/helpers/online.mjs).
 * No test here touches the network: the texts are the ones seen live.
 */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { GITHUB, classify, reason, verdict } = createRequire(import.meta.url)(
  './lib/online.cjs'
)

// git over ssh while github.com did not resolve, 2026-10-03, word for word.
const SSH_DNS = [
  'ssh: Could not resolve hostname github.com: nodename nor servname provided, or not known',
  'fatal: Could not read from remote repository.',
  '',
  'Please make sure you have the correct access rights',
  'and the repository exists.',
].join('\n')
const HTTPS_DNS =
  "fatal: unable to access 'https://github.com/gHashTag/999-multibots-telegraf.git/': Could not resolve host: github.com"
const SSH_AUTH = [
  'git@github.com: Permission denied (publickey).',
  'fatal: Could not read from remote repository.',
  '',
  'Please make sure you have the correct access rights',
  'and the repository exists.',
].join('\n')
const SSH_NO_REPO =
  'ERROR: Repository not found.\nfatal: Could not read from remote repository.'

describe('classify', () => {
  it('a zero exit is up whatever it printed', () => {
    expect(classify(0, 'Permission denied')).toBe('up')
  })
  it('the outage of 2026-10-03 is dns, over ssh and over https', () => {
    expect(classify(128, SSH_DNS)).toBe('dns')
    expect(classify(128, HTTPS_DNS)).toBe('dns')
    expect(classify(1, 'ENOTFOUND getaddrinfo ENOTFOUND nohost.invalid')).toBe(
      'dns'
    )
  })
  it('a refused key is auth, though the text also says "Could not read"', () => {
    expect(classify(128, SSH_AUTH)).toBe('auth')
    expect(classify(128, SSH_NO_REPO)).toBe('auth')
    expect(classify(1, 'gh: Bad credentials (HTTP 401)')).toBe('auth')
    expect(
      classify(4, 'To get started with GitHub CLI, please run:  gh auth login')
    ).toBe('auth')
  })
  it('a timeout or a refused connection is connect', () => {
    expect(classify(124, ' timed out')).toBe('connect')
    expect(classify(1, 'connect ECONNREFUSED 1.2.3.4:443')).toBe('connect')
  })
  it('anything else is unknown, never quietly up', () => {
    expect(classify(1, 'http 502')).toBe('unknown')
    expect(classify(1, '')).toBe('unknown')
  })
  it('a text with a refusal and an outage is auth: something answered', () => {
    const both = `${SSH_DNS}\n${SSH_AUTH}`
    expect(classify(128, both)).toBe('auth')
    expect(reason(both)).toBe('git@github.com: Permission denied (publickey).')
  })
})

describe('reason', () => {
  it('shows the cause, not git\'s closing "the repository exists."', () => {
    expect(reason(SSH_DNS)).toMatch(
      /^ssh: Could not resolve hostname github\.com/
    )
    expect(reason(SSH_AUTH)).toBe(
      'git@github.com: Permission denied (publickey).'
    )
  })
  it('falls back to the first line, cut to 140 characters', () => {
    expect(reason('http 502\nmore')).toBe('http 502')
    expect(reason('x'.repeat(300))).toHaveLength(140)
    expect(reason(undefined)).toBe('')
  })
})

describe('verdict', () => {
  const up = {
    'github-dns': 'up',
    'git-ssh': 'up',
    'github-api': 'up',
    'app-store-connect': 'up',
    render: 'up',
  }
  it('all up is 0', () => {
    expect(verdict(up).code).toBe(0)
  })
  it('GitHub unreachable is 1: wait, the code is not at fault', () => {
    const v = verdict({ ...up, 'github-dns': 'dns', 'git-ssh': 'dns' })
    expect(v.code).toBe(1)
    expect(v.next).toContain('--wait')
  })
  it('a refusal outranks an outage: 3, a retry never helps', () => {
    expect(
      verdict({ ...up, 'git-ssh': 'auth', 'github-api': 'connect' }).code
    ).toBe(3)
  })
  it('GitHub fine, a neighbour down is 1 and names it', () => {
    const v = verdict({ ...up, render: 'dns' })
    expect(v.code).toBe(1)
    expect(v.next).toMatch(/^GitHub is reachable; render is not/)
  })
  it('a GitHub probe unrecognised is never called "reachable"', () => {
    const v = verdict({ ...up, 'github-api': 'unknown', render: 'dns' })
    expect(v.code).toBe(4)
    expect(v.next).not.toMatch(/reachable/)
    // The refused road is named apart from the unrecognised (#3447 review).
    expect(v.next).toMatch(/^github-api failed in a way not recognised/)
    expect(v.next).toMatch(/; render down \(network\)$/)
  })
  it('an unrecognised failure is 4, not 0', () => {
    expect(verdict({ ...up, render: 'unknown' }).code).toBe(4)
  })
})

describe('the command', () => {
  it('bin/tri dispatches online and lists it in usage', () => {
    const tri = fs.readFileSync(path.join(ROOT, 'bin/tri'), 'utf8')
    expect(tri).toMatch(/^\s+online\) shift; .*bin\/helpers\/online\.mjs/m)
    expect(tri).toMatch(/^\s+tri online \[--wait N\]/m)
  })
  it('probes exactly the GitHub names the verdict reads', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'bin/helpers/online.mjs'),
      'utf8'
    )
    const block = src.slice(
      src.indexOf('const GITHUB = {'),
      src.indexOf('const OTHERS')
    )
    expect([...block.matchAll(/'([a-z-]+)': \(\)/g)].map(m => m[1])).toEqual(
      GITHUB
    )
  })
  it('--wait gives up at once on a refusal, and keeps a custom ssh command', () => {
    // Whitespace collapsed: prettier wraps this condition however it likes.
    const src = fs
      .readFileSync(path.join(ROOT, 'bin/helpers/online.mjs'), 'utf8')
      .replace(/\s+/g, ' ')
    expect(src).toMatch(
      /while \( ?wait > 0 && !githubUp\(results\) && !refused\(results\) &&/
    )
    expect(src).toContain('process.env.GIT_SSH_COMMAND ||')
    expect(src).toContain("'core.sshCommand'")
  })
  it('shows reason(), not the last line', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'bin/helpers/online.mjs'),
      'utf8'
    )
    expect(src).toContain('reason(raw[i].text)')
  })
  it('without git on PATH it is not a crash read as "network down"', () => {
    // Only node itself is reachable; every probe that spawns fails with 127.
    const r = spawnSync(
      process.execPath,
      [path.join(ROOT, 'bin/helpers/online.mjs'), '--json'],
      {
        encoding: 'utf8',
        timeout: 60000,
        // Offline on purpose: localhost resolves from /etc/hosts and port 2
        // refuses (port 9 is on fetch's blocked list, which reads unknown).
        env: {
          PATH: '/nonexistent',
          TRI_DNS_HOST: 'localhost',
          TRI_ASC_URL: 'http://127.0.0.1:2/',
          TRI_RENDER_URL: 'http://127.0.0.1:2',
        },
      }
    )
    expect(r.stderr).not.toMatch(/TypeError/)
    const out = JSON.parse(r.stdout)
    expect(out.results['github-dns'].kind).toBe('up')
    expect(out.results['git-ssh'].kind).toBe('unknown')
    expect(out.results['github-api'].kind).toBe('unknown')
    expect(out.results['app-store-connect'].kind).toBe('connect')
    expect(r.status).toBe(out.code)
    expect(r.status).toBe(4)
  })
  it('a bad argument is usage, exit 2, before any probe', () => {
    const r = spawnSync(
      'node',
      [path.join(ROOT, 'bin/helpers/online.mjs'), '--wait', 'soon'],
      {
        encoding: 'utf8',
        timeout: 10000,
      }
    )
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('usage: tri online')
  })
})
