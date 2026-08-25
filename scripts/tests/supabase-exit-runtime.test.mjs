#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const requireArtifacts = process.argv.includes('--require-artifacts')
const missingArtifactSuffix = '/.missing-artifact'
const sourceRoots = [
  'apps/vibee-editor/player',
  'apps/vibee-editor/render',
  'apps/vibee-editor/packages/vibee-atoms',
]
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
  'apps/vibee-editor/render/railway.toml',
  'apps/vibee-editor/render/render-server.ts',
  'apps/vibee-editor/Dockerfile',
  'apps/vibee-editor/.dockerignore',
  'apps/vibee-editor/docker-entrypoint.sh',
  'apps/vibee-editor/nginx/default.conf.template',
  'apps/vibee-editor/railway.toml',
]
const runtimeGuards = new Set([
  'apps/vibee-editor/render/src/runtime/supabaseExit.ts',
  // Production player entrypoint performs the same fail-closed environment
  // inspection before nginx starts. Only environment-name markers are allowed
  // here; literal hosts and SDK imports remain violations below.
  'apps/vibee-editor/docker-entrypoint.sh',
])
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
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.css',
  '.map',
  '.svg',
  '.xml',
  '.webmanifest',
])

const dependencyDirectories = new Set(['node_modules'])
const generatedDirectories = new Set([
  '.cache',
  '.tamagui',
  '.vite',
  '.zig-cache',
  'build',
  'coverage',
  'dist',
  'out',
  'playwright-report',
  'test-results',
  'uploads',
  'zig-out',
])
const testDirectories = new Set([
  '__fixtures__',
  '__tests__',
  'e2e',
  'fixtures',
  'test',
  'tests',
])
const sourcePathExclusions = new Set([
  // These owner-only helpers are excluded from the production Docker context.
  'apps/vibee-editor/render/scripts/agent-autopilot.ts',
  'apps/vibee-editor/render/scripts/morning-summary.ts',
])

const pathSegments = path => path.split('/').filter(Boolean)
const hasDirectory = (path, directories) =>
  pathSegments(path).some(segment => directories.has(segment))
const isTestFile = path =>
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
  /\/(?:vitest|playwright)(?:\.[^/]+)?\.config\.[cm]?[jt]s$/.test(path)
const isSupportedFile = path => supportedExtensions.has(extname(path))
const isWithinSourceRoot = path =>
  sourceRoots.some(
    sourceRoot => path === sourceRoot || path.startsWith(`${sourceRoot}/`)
  )

function isDeployableSourceFile(path) {
  return (
    isWithinSourceRoot(path) &&
    isSupportedFile(path) &&
    !sourcePathExclusions.has(path) &&
    !hasDirectory(path, dependencyDirectories) &&
    !hasDirectory(path, generatedDirectories) &&
    !hasDirectory(path, testDirectories) &&
    !isTestFile(path)
  )
}

const markerKinds = (path, text) => {
  const kinds = []
  if (/(?:^|[^a-z0-9-])(?:[a-z0-9-]+\.)*supabase\.[a-z0-9.-]+\b/i.test(text)) {
    kinds.push('supabase-host')
  }
  if (/@supabase\/supabase-js/i.test(text)) kinds.push('supabase-sdk')
  if (
    !runtimeGuards.has(path) &&
    (supabaseEnvMarker.test(text) || supabaseEnvAccess.test(text))
  ) {
    kinds.push('supabase-env')
  }
  return kinds
}

const topLevelFixture = 'apps/vibee-editor/render/top-level-runtime.mjs'
const testFixture = 'apps/vibee-editor/render/top-level-runtime.test.mjs'
const generatedFixture = 'apps/vibee-editor/render/build/top-level-runtime.mjs'
const dependencyFixture =
  'apps/vibee-editor/render/node_modules/example/top-level-runtime.mjs'
const fixtureMarker = 'const key = process.env.TOPLEVELSUPABASEKEY'
const playerEntrypointGuard = 'apps/vibee-editor/docker-entrypoint.sh'

if (
  !isDeployableSourceFile(topLevelFixture) ||
  !markerKinds(topLevelFixture, fixtureMarker).includes('supabase-env')
) {
  throw new Error('Top-level render module scanner regression')
}
if (
  !runtimeGuards.has(playerEntrypointGuard) ||
  markerKinds(playerEntrypointGuard, 'SUPABASE_RUNTIME_KEY').includes(
    'supabase-env'
  ) ||
  !markerKinds(
    playerEntrypointGuard,
    'const endpoint = "fixture.supabase.invalid"'
  ).includes('supabase-host')
) {
  throw new Error('Player entrypoint guard scanner regression')
}
for (const excludedFixture of [
  testFixture,
  generatedFixture,
  dependencyFixture,
]) {
  if (isDeployableSourceFile(excludedFixture)) {
    throw new Error(`Static scanner exclusion regression (${excludedFixture})`)
  }
}

const shouldSkipDirectory = (path, mode) =>
  hasDirectory(path, dependencyDirectories) ||
  (mode === 'source' &&
    (hasDirectory(path, generatedDirectories) ||
      hasDirectory(path, testDirectories)))

async function walk(path, mode) {
  const entries = await readdir(join(root, path), { withFileTypes: true })
  const out = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(child, mode)) {
        out.push(...(await walk(child, mode)))
      }
    } else if (
      mode === 'artifact'
        ? isSupportedFile(child) && !isTestFile(child)
        : isDeployableSourceFile(child)
    ) {
      out.push(child)
    }
  }
  return out
}

const files = [...manifests]
for (const path of sourceRoots) files.push(...(await walk(path, 'source')))
for (const path of artifactRoots) {
  try {
    if ((await stat(join(root, path))).isDirectory()) {
      files.push(...(await walk(path, 'artifact')))
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
  for (const kind of markerKinds(path, text)) {
    violations.push(`${path}:${kind}`)
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
