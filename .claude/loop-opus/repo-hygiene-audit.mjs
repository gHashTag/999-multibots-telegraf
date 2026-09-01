#!/usr/bin/env node
// tri repo-hygiene -- flag repo-hygiene leaks that a dead CI won't catch:
// (1) tracked SYMLINKS (git mode 120000), and (2) absolute machine paths
// (/Users/<name>/, /home/<name>/, C:\Users\) in tracked source/config files.
//
// WHY THIS EXISTS. iter245 (#1609): PR #1608 committed `node_modules` as a symlink
// to /Users/playom/999-multibots-telegraf/node_modules. A tracked absolute-path
// symlink breaks pull/checkout for every other machine (git aborts overwriting the
// untracked real node_modules) and points to nowhere on a fresh clone. .gitignore
// `node_modules/` (trailing slash) did not catch it. CI is dead (billing) so nothing
// flagged it. This tool is the standing check: run it after syncing main, or in a
// git hook. A NEW tracked symlink is the high-signal alert (should be 0).
//
// Usage: node .claude/loop-opus/repo-hygiene-audit.mjs [--self-check]

import { execSync } from 'node:child_process'

// Parse `git ls-tree -r HEAD` lines; return the paths whose mode is a symlink.
export function symlinkPaths(lsTreeOutput) {
  return lsTreeOutput
    .split('\n')
    .filter(Boolean)
    .filter(l => l.startsWith('120000 '))
    .map(l => l.split('\t').slice(1).join('\t'))
}

// Parse `git grep -nI` output lines "path:line:text"; return {path,line,text}.
export function absPathHits(grepOutput) {
  return grepOutput
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const m = l.match(/^([^:]+):(\d+):(.*)$/)
      return m ? { path: m[1], line: +m[2], text: m[3] } : null
    })
    .filter(Boolean)
}

function selfCheck() {
  const ls = [
    '100644 blob abc\tsrc/a.ts',
    '120000 blob def\tnode_modules',
    '120000 blob ghi\tsome/link',
  ].join('\n')
  const grep = 'scripts/x.js:10:const p = "/Users/foo/bar"\nsrc/y.ts:3:ok'
  const s = symlinkPaths(ls)
  const g = absPathHits(grep)
  const ok =
    s.length === 2 &&
    s.includes('node_modules') &&
    s.includes('some/link') &&
    g.length === 2 &&
    g[0].path === 'scripts/x.js' &&
    g[0].line === 10
  console.log(ok ? 'SELF-CHECK OK' : 'SELF-CHECK FAILED')
  process.exit(ok ? 0 : 1)
}

function git(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (e) {
    // git grep exits 1 when there are no matches -- that is a clean result.
    return e.stdout ? String(e.stdout) : ''
  }
}

// --gate: exit 1 if ANY tracked symlink exists (the #1608 class -- a tracked
// symlink breaks pull/checkout repo-wide; the clean baseline is 0). The
// absolute-path check stays informational (50 existing files -> not gated).
function gate() {
  const symlinks = symlinkPaths(git('git ls-tree -r HEAD'))
  if (symlinks.length) {
    console.error(
      'repo-hygiene GATE FAILED: tracked symlink(s) found -- a #1608-style leak ' +
        'that breaks pull/checkout for every other machine:'
    )
    symlinks.forEach(p => console.error(`  120000  ${p}`))
    console.error(
      'Fix: `git rm <path>` + add its name (no trailing slash) to .gitignore.'
    )
    process.exit(1)
  }
  console.log('repo-hygiene: no tracked symlinks -- ok')
  process.exit(0)
}

function main() {
  if (process.argv.includes('--self-check')) return selfCheck()
  if (process.argv.includes('--gate')) return gate()
  const symlinks = symlinkPaths(git('git ls-tree -r HEAD'))
  const abs = absPathHits(
    git(
      `git grep -nIE "/Users/[a-zA-Z0-9._-]+/|/home/[a-zA-Z0-9._-]+/|C:\\\\\\\\Users\\\\\\\\" -- '*.ts' '*.js' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' ':!*/__tests__/*' ':!*/tests/*' ':!*.test.*'`
    )
  )
  console.log('== tracked SYMLINKS (should be 0 -- a #1608-style leak) ==')
  if (!symlinks.length) console.log('  none')
  else symlinks.forEach(p => console.log(`  120000  ${p}`))

  // Group absolute-path hits by top dir; scripts/* is known throwaway debt.
  const byDir = {}
  for (const h of abs) {
    const top = h.path.split('/').slice(0, 2).join('/')
    ;(byDir[top] ||= []).push(h)
  }
  console.log(
    `\n== absolute machine paths in tracked files (${abs.length}; scripts/* = known throwaway) ==`
  )
  for (const dir of Object.keys(byDir).sort())
    console.log(`  ${byDir[dir].length.toString().padStart(3)}  ${dir}/`)

  const critical = symlinks.length
  console.log(
    `\nsymlinks ${symlinks.length} (critical), abs-path files ${abs.length} (hygiene). ` +
      (critical
        ? 'FIX the tracked symlink(s): git rm + .gitignore the name (no trailing slash).'
        : 'no tracked symlinks -- clean.')
  )
}

main()
