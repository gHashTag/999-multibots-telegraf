#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const entrypoint = fileURLToPath(
  new URL('../../apps/vibee-editor/docker-entrypoint.sh', import.meta.url)
)

const runEntrypointGuard = extraEnv =>
  spawnSync('/bin/sh', [entrypoint, process.execPath, '-e', ''], {
    encoding: 'utf8',
    env: {
      PATH: '/usr/bin:/bin',
      ...extraEnv,
    },
  })

test('player entrypoint accepts a clean environment', () => {
  const result = runEntrypointGuard({
    PUBLIC_MEDIA_ORIGIN: 'https://media.example.invalid',
    SUPABASE_UNUSED: '',
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
})

test('player entrypoint rejects any nonempty Supabase-named variable', () => {
  const redactionSentinel = 'must-never-appear-in-stderr'
  const result = runEntrypointGuard({
    MY_SUPABASE_RUNTIME_KEY: redactionSentinel,
  })

  assert.equal(result.status, 78)
  assert.match(result.stderr, /forbidden backend environment.*redacted/i)
  assert.doesNotMatch(result.stderr, /MY_SUPABASE_RUNTIME_KEY/)
  assert.doesNotMatch(result.stderr, new RegExp(redactionSentinel))
})

test('player entrypoint rejects a Supabase host stored under another name', () => {
  const forbiddenUrl =
    'https://synthetic-project.supabase.invalid/storage/object'
  const result = runEntrypointGuard({
    PUBLIC_MEDIA_ORIGIN: forbiddenUrl,
  })

  assert.equal(result.status, 78)
  assert.match(result.stderr, /forbidden backend environment.*redacted/i)
  assert.doesNotMatch(result.stderr, new RegExp(forbiddenUrl))
})

test('player entrypoint also rejects an apex Supabase host', () => {
  const forbiddenUrl = 'https://supabase.invalid/runtime'
  const result = runEntrypointGuard({
    PUBLIC_MEDIA_ORIGIN: forbiddenUrl,
  })

  assert.equal(result.status, 78)
  assert.match(result.stderr, /forbidden backend environment.*redacted/i)
  assert.doesNotMatch(result.stderr, new RegExp(forbiddenUrl))
})
