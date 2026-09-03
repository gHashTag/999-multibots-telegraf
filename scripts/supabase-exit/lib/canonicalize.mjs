#!/usr/bin/env node

import { lstatSync, realpathSync, readFileSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const COMPLETE_KIND = 'snapshot_complete'
const FORBIDDEN_KEYS = new Set(['rolpassword'])

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue)
  if (!value || typeof value !== 'object') return value

  const out = {}
  for (const key of Object.keys(value).sort()) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error('forbidden catalog field')
    }
    out[key] = sortedValue(value[key])
  }
  return out
}

export function stableStringify(value) {
  return JSON.stringify(sortedValue(value))
}

export function canonicalizeNdjson(input) {
  const records = []
  const lines = String(input).split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue
    let value
    try {
      value = JSON.parse(line)
    } catch {
      throw new Error(`invalid catalog JSON at line ${index + 1}`)
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`invalid catalog record at line ${index + 1}`)
    }
    records.push(sortedValue(value))
  }

  const complete = records.filter(
    record => record.kind === COMPLETE_KIND && record.value === true
  )
  const last = records.at(-1)
  if (
    complete.length !== 1 ||
    last?.kind !== COMPLETE_KIND ||
    last?.value !== true
  ) {
    throw new Error('catalog is partial: snapshot_complete sentinel missing')
  }

  return `${records.map(stableStringify).join('\n')}\n`
}

function inside(candidate, parent) {
  const delta = relative(parent, candidate)
  return delta === '' || (!delta.startsWith(`..${sep}`) && delta !== '..')
}

function secureStat(path, expectedKind) {
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    throw new Error(`${expectedKind} does not exist`)
  }
  if (stat.isSymbolicLink())
    throw new Error(`${expectedKind} must not be a symlink`)
  return stat
}

export function validateOutputDir(path, repositoryRoot) {
  if (!isAbsolute(path)) throw new Error('evidence directory must be absolute')
  if (!isAbsolute(repositoryRoot))
    throw new Error('repository root must be absolute')

  const stat = secureStat(path, 'evidence directory')
  if (!stat.isDirectory())
    throw new Error('evidence directory must be a directory')
  const candidate = realpathSync(path)
  const repository = realpathSync(repositoryRoot)
  if (inside(candidate, repository)) {
    throw new Error('evidence directory must stay outside the repository')
  }
  if ((stat.mode & 0o777) !== 0o700) {
    throw new Error('evidence directory mode must be 0700')
  }
  return candidate
}

export function validatePgpass(path, repositoryRoot) {
  if (!isAbsolute(path)) throw new Error('PGPASSFILE must be absolute')
  const stat = secureStat(path, 'PGPASSFILE')
  if (!stat.isFile()) throw new Error('PGPASSFILE must be a regular file')
  const candidate = realpathSync(path)
  const repository = realpathSync(repositoryRoot)
  if (inside(candidate, repository)) {
    throw new Error('PGPASSFILE must stay outside the repository')
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new Error('PGPASSFILE mode must be 0600')
  }
  return candidate
}

export function validateEncryptedInput(path, repositoryRoot) {
  if (!isAbsolute(path)) throw new Error('encrypted input must be absolute')
  const stat = secureStat(path, 'encrypted input')
  if (!stat.isFile()) throw new Error('encrypted input must be a regular file')
  const candidate = realpathSync(path)
  const repository = realpathSync(repositoryRoot)
  if (inside(candidate, repository)) {
    throw new Error('encrypted input must stay outside the repository')
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error('encrypted input must not be group/world accessible')
  }
  return candidate
}

export function validateChecksumSidecar(path, inputName) {
  if (
    !inputName ||
    inputName !== basename(inputName) ||
    ['.', '..'].includes(inputName)
  ) {
    throw new Error('checksum input name must be a basename')
  }
  const stat = secureStat(path, 'checksum sidecar')
  if (!stat.isFile()) throw new Error('checksum sidecar must be a regular file')

  const content = readFileSync(path, 'utf8')
  const match = content.match(/^([0-9a-f]{64}) {2}([^\r\n]+)\r?\n?$/i)
  if (!match || match[2] !== inputName) {
    throw new Error('checksum sidecar must name only the selected ciphertext')
  }
  return match[1].toLowerCase()
}

function requiredArg(args, index, name) {
  const value = args[index]
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command === '--canonicalize-ndjson') {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    process.stdout.write(
      canonicalizeNdjson(Buffer.concat(chunks).toString('utf8'))
    )
    return
  }
  if (command === '--validate-output-dir') {
    validateOutputDir(
      requiredArg(args, 0, 'evidence directory'),
      requiredArg(args, 1, 'repository root')
    )
    return
  }
  if (command === '--validate-pgpass') {
    validatePgpass(
      requiredArg(args, 0, 'PGPASSFILE'),
      requiredArg(args, 1, 'repository root')
    )
    return
  }
  if (command === '--validate-input') {
    validateEncryptedInput(
      requiredArg(args, 0, 'encrypted input'),
      requiredArg(args, 1, 'repository root')
    )
    return
  }
  if (command === '--checksum-hash') {
    process.stdout.write(
      `${validateChecksumSidecar(
        requiredArg(args, 0, 'checksum sidecar'),
        requiredArg(args, 1, 'input basename')
      )}\n`
    )
    return
  }
  if (command === '--read-canonical-file') {
    process.stdout.write(
      canonicalizeNdjson(readFileSync(requiredArg(args, 0, 'file'), 'utf8'))
    )
    return
  }
  throw new Error('unknown canonicalizer command')
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : ''
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('supabase-exit validation failed\n')
    process.exitCode = 1
  })
}
