#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const requireArtifacts = process.argv.includes('--require-artifacts')
const missingArtifactSuffix = '/.missing-artifact'
const roots = ['apps/vibee-editor/player/src', 'apps/vibee-editor/render/src']
const artifactRoots = [
  'apps/vibee-editor/player/dist',
  'apps/vibee-editor/render/build',
]
const manifests = [
  'apps/vibee-editor/player/package.json',
  'apps/vibee-editor/player/package-lock.json',
  'apps/vibee-editor/render/package.json',
  'apps/vibee-editor/render/package-lock.json',
  'apps/vibee-editor/render/Dockerfile',
  'apps/vibee-editor/render/render-server.ts',
]
const runtimeGuard = 'apps/vibee-editor/render/src/runtime/supabaseExit.ts'
const supabaseEnvMarker = /\b[A-Z0-9_]*SUPABASE[A-Z0-9_]*\b/
const supabaseEnvAccess =
  /process\.env(?:\.|\[['"])[A-Za-z0-9_]*supabase[A-Za-z0-9_]*/i
const envMarkerFixtures = [
  'SUPABASE_URL',
  'SUPABASEKEY',
  'MY_SUPABASETOKEN',
  'VITE_SUPABASEURL',
]
if (envMarkerFixtures.some(name => !supabaseEnvMarker.test(name))) {
  throw new Error('Supabase environment marker regression')
}
const supportedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.html',
  '.css',
  '.map',
])

async function walk(path) {
  const entries = await readdir(join(root, path), { withFileTypes: true })
  const out = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(child)))
    else if (
      supportedExtensions.has(extname(entry.name)) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
    ) {
      out.push(child)
    }
  }
  return out
}

const files = [...manifests]
for (const path of roots) files.push(...(await walk(path)))
for (const path of artifactRoots) {
  try {
    if ((await stat(join(root, path))).isDirectory()) {
      files.push(...(await walk(path)))
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    if (requireArtifacts) files.push(`${path}${missingArtifactSuffix}`)
  }
}

const violations = []
for (const path of [...new Set(files)].sort()) {
  if (path.endsWith(missingArtifactSuffix)) {
    violations.push(
      `${path.slice(0, -missingArtifactSuffix.length)}:missing-artifact`
    )
    continue
  }
  const text = await readFile(join(root, path), 'utf8')
  if (/https?:\/\/[^\s'"`]*\.supabase\.[a-z0-9.-]+\b/i.test(text)) {
    violations.push(`${path}:supabase-host`)
  }
  if (/@supabase\/supabase-js/i.test(text)) {
    violations.push(`${path}:supabase-sdk`)
  }
  if (
    path !== runtimeGuard &&
    (supabaseEnvMarker.test(text) || supabaseEnvAccess.test(text))
  ) {
    violations.push(`${path}:supabase-env`)
  }
}

if (violations.length) {
  console.error(
    `Supabase-free player/render contract failed (${violations.length} marker(s))`
  )
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log(
  `Supabase-free player/render contract PASS (${files.length} runtime/artifact files)`
)
