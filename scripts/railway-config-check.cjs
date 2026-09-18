#!/usr/bin/env node
/**
 * DOES EACH RAILWAY SERVICE READ ITS OWN CONFIG, AND DID ANYTHING GET STUCK.
 *
 * Found 2026-09-17: the mini app (service `vibee-editor`, Root Directory
 * `apps/vibee-editor`) had its Railway Config File set to `/railway.toml`. That
 * path is resolved from the REPOSITORY root, not from the Root Directory, so the
 * service read the BOT's file -- whose watchPatterns are `src/**`,
 * `package.json` and friends. Every merge that touched only the player ended
 * "SKIPPED: No changes to watched files", and the mini app reached production
 * only when some unrelated merge happened to change the bot's `src/`. Four
 * merges sat undeployed; the right file, `apps/vibee-editor/railway.toml`, was
 * in the repository the whole time, with a comment describing the same symptom
 * from 09.09. Nothing checked which file the service actually read.
 *
 * Railway's CLI does not expose the service setting itself, but a deployment
 * Railway evaluates records `meta.configFile` and `meta.rootDirectory`, and a
 * built one also the manifest it applied. So this reads what was really used,
 * and checks:
 *
 *   1. the config file sits inside the service's Root Directory;
 *   2. the file's `[service] name` is this service, not another one;
 *   3. the watchPatterns the running build applied are the ones in that file;
 *   4. a recent SKIPPED deploy did not change files the service's OWN file
 *      watches (the exact symptom above);
 *   5. no merge since the running build touches those files (stuck changes).
 *
 * Checks 1-3 describe the newest deployment that recorded its config. After a
 * fix in the Railway UI they clear on the next deployment Railway evaluates --
 * a merge or "Deploy latest commit"; even a skipped one records the config.
 *
 *   node scripts/railway-config-check.cjs [service ...]
 *
 * Exit: 0 all fine, 1 a problem found, 2 Railway or git could not be read.
 * Read-only; no token or variable value is read.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execSync, execFileSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')

const PAINT = Boolean(process.stdout.isTTY)
const ESC = PAINT ? String.fromCharCode(27) : ''
const wrap = (code, s) => (PAINT ? `${ESC}[${code}m${s}${ESC}[0m` : s)
const dim = s => wrap(2, s)
const red = s => wrap(31, s)
const green = s => wrap(32, s)
const bold = s => wrap(1, s)

/* ---------------------------------------------------------------- pure part */

/**
 * The two things this needs from a railway.toml: `[service] name` and
 * `[build] watchPatterns`. A full TOML parser is not a dependency here, and the
 * files in this repository use exactly these shapes.
 */
function parseRailwayToml(text) {
  let section = ''
  let name = null
  let patterns = null
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/#.*$/, '').trim()
    if (!line) continue
    const sec = /^\[([^\]]+)\]$/.exec(line)
    if (sec) {
      section = sec[1].trim()
      continue
    }
    if (section === 'service') {
      const m = /^name\s*=\s*"([^"]*)"/.exec(line)
      if (m) name = m[1]
    }
    if (section === 'build' && /^watchPatterns\s*=/.test(line)) {
      let body = line.slice(line.indexOf('=') + 1)
      while (!body.includes(']') && i + 1 < lines.length) {
        i += 1
        body += '\n' + lines[i].replace(/#.*$/, '')
      }
      patterns = [...body.matchAll(/"([^"]*)"/g)].map(m => m[1])
    }
  }
  return { name, patterns }
}

/** A gitignore-style glob as a RegExp over a repo-relative path. */
function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 1
        if (glob[i + 1] === '/') {
          i += 1
          re += '(?:.*/)?'
        } else {
          re += '.*'
        }
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${re}$`)
}

/**
 * Does a changed file trigger a build under these patterns. Later patterns win,
 * so `!…test.ts` after `player/**` excludes a test that the first one included.
 */
function watched(file, patterns) {
  let hit = false
  for (const p of patterns || []) {
    const negate = p.startsWith('!')
    if (globToRegExp(negate ? p.slice(1) : p).test(file)) hit = !negate
  }
  return hit
}

/** "/apps/vibee-editor/railway.toml" -> "apps/vibee-editor/railway.toml" */
const repoPath = p => String(p || '').replace(/^\/+/, '')

/**
 * Check 1. A service with a Root Directory must read a config inside it. A
 * service at the repository root may read any file, and check 2 decides whether
 * that file is its own.
 */
function configInsideRoot(rootDirectory, configFile) {
  if (!configFile) return { ok: false, why: 'no config file recorded' }
  const root = repoPath(rootDirectory).replace(/\/+$/, '')
  if (!root) return { ok: true }
  const cfg = repoPath(configFile)
  if (cfg === root || cfg.startsWith(root + '/')) return { ok: true }
  return {
    ok: false,
    why:
      `config "${configFile}" is outside Root Directory "${rootDirectory}" -- ` +
      'the path is resolved from the repository root, so this service reads ' +
      "another service's file",
  }
}

function samePatterns(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || [])
}

/* ------------------------------------------------------------------- IO part */

function sh(cmd) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: '/bin/sh',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function railwayJson(args) {
  return JSON.parse(sh(`railway ${args} 2>/dev/null`))
}

function deploymentsOf(service) {
  // `railway service` changes the linked service for this directory; the
  // previous link is restored at the end of main().
  sh(`railway service ${JSON.stringify(service)} >/dev/null 2>&1 || true`)
  return railwayJson('deployment list --json')
}

/**
 * The service this directory is linked to, as the CLI stores it. `railway
 * status --json` does not say which one; ~/.railway/config.json does, by id,
 * and `railway service` accepts the id back.
 */
function linkedService() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(
        path.join(require('node:os').homedir(), '.railway', 'config.json'),
        'utf8'
      )
    )
    const here = Object.values(cfg.projects || {}).find(
      p => path.resolve(String(p.projectPath || '')) === ROOT
    )
    return here?.service || null
  } catch {
    return null
  }
}

function changedFiles(commit) {
  try {
    return execFileSync(
      'git',
      ['diff', '--name-only', '-z', `${commit}^1`, commit],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
      .split('\0')
      .filter(Boolean)
  } catch {
    return null
  }
}

function mergesSince(commit) {
  try {
    return execFileSync(
      'git',
      ['log', '--format=%H%x09%s', `${commit}..origin/main`],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
      .split('\n')
      .filter(Boolean)
      .map(l => {
        const [hash, ...rest] = l.split('\t')
        return { hash, subject: rest.join('\t') }
      })
  } catch {
    return null
  }
}

/** Every tracked railway.toml, by the service name written inside it. */
function repoConfigs() {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(f => /(^|\/)railway\.toml$/.test(f))
  const byName = new Map()
  for (const f of files) {
    const parsed = parseRailwayToml(fs.readFileSync(path.join(ROOT, f), 'utf8'))
    if (parsed.name) byName.set(parsed.name, { file: f, ...parsed })
  }
  return byName
}

function checkService(service, own) {
  const problems = []
  const notes = []
  const deployments = deploymentsOf(service)
  // Railway records the config on a deployment it evaluated, built or skipped;
  // the newest such record is the closest thing to the current setting.
  const built = deployments.find(d => d.meta?.configFile)
  if (!built) {
    notes.push('no recent deployment recorded which config it read')
    return { problems, notes }
  }
  const m = built.meta
  notes.push(
    `config as of ${String(built.createdAt).slice(0, 19)} (${built.status} ` +
      `${String(m.commitHash).slice(0, 9)}): root=${m.rootDirectory || '/'} config=${m.configFile}`
  )

  const inside = configInsideRoot(m.rootDirectory, m.configFile)
  if (!inside.ok) problems.push(inside.why)

  const read = parseRailwayToml(
    (() => {
      try {
        return fs.readFileSync(path.join(ROOT, repoPath(m.configFile)), 'utf8')
      } catch {
        return ''
      }
    })()
  )
  if (read.name && read.name !== service) {
    problems.push(
      `config "${m.configFile}" declares [service] name = "${read.name}", not "${service}"`
    )
  }

  const applied = m.fileServiceManifest?.build?.watchPatterns
  if (own?.patterns && applied && !samePatterns(applied, own.patterns)) {
    problems.push(
      `the running build applied watchPatterns that are not the ones in ${own.file}`
    )
  }

  if (!own) {
    notes.push(
      'no railway.toml in the repository names this service; checks 4-5 skipped'
    )
    return { problems, notes }
  }
  if (!own.patterns) {
    notes.push(
      `${own.file} sets no watchPatterns, so the Railway UI decides what deploys ` +
        'and that is not readable from here; checks 4-5 skipped'
    )
    return { problems, notes }
  }

  /*
   * Check 4: skipped although the commit touched files this service watches.
   *
   * ONLY SINCE THE CONFIG RECORD ABOVE. A skip from before a setting was fixed
   * is history, not a problem, and reporting it for ever teaches the reader to
   * scroll past the whole check -- measured on this very tool the morning after
   * the mini app's config was corrected: three real old skips kept it red while
   * every skip after the fix was correct.
   */
  const cutoff = Date.parse(built.createdAt)
  for (const d of deployments.slice(0, 20)) {
    if (d.status !== 'SKIPPED' || !d.meta?.commitHash) continue
    if (Number.isFinite(cutoff) && Date.parse(d.createdAt) < cutoff) continue
    const files = changedFiles(d.meta.commitHash)
    if (!files) continue
    const hits = files.filter(f => watched(f, own.patterns))
    if (hits.length) {
      problems.push(
        `SKIPPED ${String(d.meta.commitHash).slice(0, 9)} (${String(d.createdAt).slice(0, 19)}) ` +
          `although it changed ${hits.length} ` +
          `file(s) ${own.file} watches (e.g. ${hits[0]})`
      )
    }
  }

  // Check 5: merged since the running build and touching watched files.
  const running = (deployments.find(d => d.status === 'SUCCESS') || built).meta
  const since = mergesSince(running.commitHash)
  if (since === null) {
    notes.push('could not read git history since the running build')
  } else {
    const stuck = since.filter(c => {
      const files = changedFiles(c.hash)
      return files && files.some(f => watched(f, own.patterns))
    })
    if (stuck.length) {
      problems.push(
        `${stuck.length} commit(s) on main since the running build touch watched files ` +
          `and are not deployed: ${stuck
            .slice(0, 4)
            .map(c => c.hash.slice(0, 9))
            .join(', ')}${stuck.length > 4 ? ', …' : ''}`
      )
    }
  }
  return { problems, notes }
}

function main() {
  try {
    execFileSync('git', ['fetch', '-q', 'origin', 'main'], { cwd: ROOT })
  } catch {
    /* offline: history may be stale, the checks still run */
  }

  let configs
  try {
    configs = repoConfigs()
  } catch (e) {
    console.error(`could not read the repository configs: ${e.message}`)
    process.exitCode = 2
    return
  }

  const wanted = process.argv.slice(2)
  const services = wanted.length ? wanted : [...configs.keys()]
  const before = linkedService()
  let failed = 0

  try {
    for (const service of services) {
      let result
      try {
        result = checkService(service, configs.get(service))
      } catch (e) {
        console.log(
          `${red('unreadable')} ${bold(service)}  ${dim(String(e.message).slice(0, 100))}`
        )
        process.exitCode = 2
        continue
      }
      const ok = result.problems.length === 0
      console.log(
        `${ok ? green('ok        ') : red('PROBLEM   ')} ${bold(service)}`
      )
      for (const n of result.notes) console.log(`           ${dim(n)}`)
      for (const p of result.problems)
        console.log(`           ${red('-')} ${p}`)
      if (!ok) failed += 1
    }
  } finally {
    if (before) {
      try {
        sh(`railway service ${JSON.stringify(before)} >/dev/null 2>&1 || true`)
      } catch {
        /* the link is a convenience; losing it breaks nothing */
      }
    }
  }

  if (failed) {
    console.log(
      dim(
        '\nChecks 1-3 read the newest deployment that recorded its config. If the ' +
          'setting was just fixed in the Railway UI, they clear on the next ' +
          'deployment Railway evaluates ("Deploy latest commit" or any merge).'
      )
    )
    if (process.exitCode !== 2) process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  parseRailwayToml,
  globToRegExp,
  watched,
  configInsideRoot,
  samePatterns,
}
