import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const toolDir = join(repoRoot, 'scripts', 'supabase-exit')
const canonicalizerPath = join(toolDir, 'lib', 'canonicalize.mjs')
const inventoryPath = join(toolDir, 'inventory-root-consumers.mjs')
const catalogPath = join(toolDir, 'catalog-snapshot.sql')
const snapshotPath = join(toolDir, 'snapshot-catalog.sh')
const backupPath = join(toolDir, 'backup-source.sh')
const restorePath = join(toolDir, 'restore-drill.sh')

const ownedPaths = [
  canonicalizerPath,
  inventoryPath,
  catalogPath,
  snapshotPath,
  backupPath,
  restorePath,
]

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'trinity-supabase-exit-contract-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function writeExecutable(path, source) {
  writeFileSync(path, source, { mode: 0o700 })
  chmodSync(path, 0o700)
}

function makeFakeBin(root) {
  const bin = join(root, 'bin')
  mkdirSync(bin, { mode: 0o700 })

  writeExecutable(
    join(bin, 'psql'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'psql %s\\n' "$*" >> "\${FAKE_LOG}"
if [[ "$*" == *"server_version_num"* ]]; then
  printf '%s\\n' "\${FAKE_SOURCE_MAJOR:-170000}"
elif [[ "\${FAKE_PARTIAL:-0}" == "1" ]]; then
  printf '%s\\n' '{"kind":"server","server_version_num":"170000"}'
else
  printf '%s\\n' \
    '{"server_version_num":"170000","kind":"server"}' \
    '{"value":true,"kind":"snapshot_complete"}'
fi
`
  )

  writeExecutable(
    join(bin, 'pg_dump'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'pg_dump %s\\n' "$*" >> "\${FAKE_LOG}"
if [[ "\${1:-}" == "--version" ]]; then
  printf 'pg_dump (PostgreSQL) %s\\n' "\${FAKE_CLIENT_VERSION:-18.1}"
else
  printf 'PGDMP-fixture-bytes'
fi
`
  )

  writeExecutable(
    join(bin, 'gpg'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'gpg %s\\n' "$*" >> "\${FAKE_LOG}"
out=''
decrypt=0
input=''
while (($#)); do
  case "$1" in
    --output) out="$2"; shift 2 ;;
    --decrypt) decrypt=1; shift ;;
    --recipient) shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
if ((decrypt)); then
  cat "$input"
elif [[ "$out" == '-' ]]; then
  cat
else
  test -n "$out"
  cat > "$out"
fi
`
  )

  writeExecutable(
    join(bin, 'pg_restore'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'pg_restore %s\\n' "$*" >> "\${FAKE_LOG}"
cat >/dev/null
`
  )

  return bin
}

function secureDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  chmodSync(path, 0o700)
}

function secureFile(path, value = 'fixture') {
  writeFileSync(path, value, { mode: 0o600 })
  chmodSync(path, 0o600)
}

function fakeEnv(root, bin, overrides = {}) {
  const output = join(root, 'evidence')
  const pgpass = join(root, 'pgpass')
  const log = join(root, 'fake.log')
  secureDir(output)
  secureFile(pgpass, 'host:port:database:user:password')
  secureFile(log, '')
  return {
    ...process.env,
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    MIGRATION_EVIDENCE_DIR: output,
    SOURCE_PGSERVICE: 'source_fixture',
    SOURCE_PGPASSFILE: pgpass,
    BACKUP_RECIPIENT: 'fixture-recipient',
    FAKE_LOG: log,
    ...overrides,
  }
}

function run(path, args = [], env = process.env) {
  return spawnSync(path, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  })
}

test('owned additive tooling exists and carries fail-closed static contracts', () => {
  assert.deepEqual(
    ownedPaths.filter(path => !existsSync(path)),
    [],
    'all owned tooling files must exist'
  )

  const sql = readFileSync(catalogPath, 'utf8')
  assert.match(sql, /BEGIN[^;]*READ ONLY/is)
  assert.match(sql, /snapshot_complete/)
  assert.match(sql, /LEFT JOIN pg_roles AS role_name/)
  assert.match(sql, /'PUBLIC'/)
  assert.doesNotMatch(sql, /rolpassword/i)

  const backup = readFileSync(backupPath, 'utf8')
  assert.match(backup, /--format=custom/)
  assert.match(backup, /--dbname=["']?service=/)
  assert.match(backup, /--no-password/)
  assert.match(backup, /gpg/)
  assert.match(backup, /mktemp/)
  assert.doesNotMatch(backup, /--yes/)
  assert.match(backup, /--no-auto-key-locate/)
  assert.match(backup, /--no-auto-key-retrieve/)
  assert.doesNotMatch(backup, /DATABASE_URL|postgres(?:ql)?:\/\//)
  assert.doesNotMatch(backup, /set -x/)

  const snapshot = readFileSync(snapshotPath, 'utf8')
  assert.match(snapshot, /--no-password/)
  assert.match(snapshot, /--no-auto-key-locate/)
  assert.match(snapshot, /--no-auto-key-retrieve/)

  const restore = readFileSync(restorePath, 'utf8')
  assert.match(restore, /--exit-on-error/)
  assert.match(restore, /--single-transaction/)
  assert.match(restore, /--no-password/)
  assert.match(restore, /RESTORE_TARGET_ACK/)
  assert.match(restore, /mktemp/)
  assert.match(restore, /--no-auto-key-locate/)
  assert.match(restore, /--no-auto-key-retrieve/)
  assert.doesNotMatch(restore, /DATABASE_URL|postgres(?:ql)?:\/\//)
  assert.doesNotMatch(restore, /set -x/)
})

test('canonical NDJSON is deterministic, complete, and rejects password fields', async () => {
  const module = await import(pathToFileURL(canonicalizerPath).href)
  const input = [
    JSON.stringify({ z: 1, kind: 'server', nested: { b: 2, a: 1 } }),
    JSON.stringify({ value: true, kind: 'snapshot_complete' }),
    '',
  ].join('\n')
  assert.equal(
    module.canonicalizeNdjson(input),
    '{"kind":"server","nested":{"a":1,"b":2},"z":1}\n' +
      '{"kind":"snapshot_complete","value":true}\n'
  )
  assert.throws(
    () => module.canonicalizeNdjson('{"kind":"server"}\n'),
    /snapshot_complete/
  )
  assert.throws(
    () =>
      module.canonicalizeNdjson(
        '{"kind":"role","rolpassword":"forbidden"}\n' +
          '{"kind":"snapshot_complete","value":true}\n'
      ),
    /forbidden/i
  )
})

test('evidence and pgpass validation reject relative, repository, symlink, and broad paths', async t => {
  const module = await import(pathToFileURL(canonicalizerPath).href)
  const root = tempRoot(t)
  const good = join(root, 'evidence')
  const broad = join(root, 'broad')
  const linked = join(root, 'linked')
  const pgpass = join(root, 'pgpass')
  secureDir(good)
  mkdirSync(broad, { mode: 0o755 })
  symlinkSync(good, linked)
  secureFile(pgpass)

  assert.throws(
    () => module.validateOutputDir('relative', repoRoot),
    /absolute/
  )
  assert.throws(() => module.validateOutputDir(repoRoot, repoRoot), /outside/i)
  assert.throws(() => module.validateOutputDir(broad, repoRoot), /0700/)
  assert.throws(() => module.validateOutputDir(linked, repoRoot), /symlink/i)
  assert.equal(module.validateOutputDir(good, repoRoot), realpathSync(good))

  assert.throws(() => module.validatePgpass('relative', repoRoot), /absolute/)
  assert.equal(module.validatePgpass(pgpass, repoRoot), realpathSync(pgpass))
  chmodSync(pgpass, 0o644)
  assert.throws(() => module.validatePgpass(pgpass, repoRoot), /0600/)
})

test('database clients reject inherited PGPASSWORD before invoking any tool', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin, { PGPASSWORD: 'inherited-fixture-secret' }) // secret-guard-ok: синтетическая фикстура; тест доказывает, что значение НЕ попадает в вывод

  const backup = run(backupPath, [], env)
  const snapshot = run(snapshotPath, [], env)

  const encrypted = join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg')
  secureFile(encrypted, 'selected-ciphertext')
  const checksum = execFileSync('shasum', ['-a', '256', 'source.dump.gpg'], {
    cwd: env.MIGRATION_EVIDENCE_DIR,
    encoding: 'utf8',
  })
  secureFile(`${encrypted}.sha256`, checksum)
  const restore = run(restorePath, [], {
    ...env,
    RESTORE_INPUT: encrypted,
    RESTORE_PGSERVICE: 'trinity_root_restore_fixture',
    RESTORE_PGPASSFILE: env.SOURCE_PGPASSFILE,
    RESTORE_TARGET_KIND: 'disposable',
    RESTORE_TARGET_ACK: 'I_UNDERSTAND_THIS_TARGET_IS_DISPOSABLE',
  })

  for (const result of [backup, snapshot, restore]) {
    assert.notEqual(result.status, 0)
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /inherited-fixture-secret/
    )
  }
  assert.equal(readFileSync(env.FAKE_LOG, 'utf8'), '')
})

test('source consumer manifest is deterministic for classified Supabase surfaces', t => {
  const root = tempRoot(t)
  const src = join(root, 'src')
  secureDir(src)
  writeFileSync(
    join(src, 'consumer.ts'),
    `import { createClient } from '@supabase/supabase-js'
const db = createClient('fixture', 'fixture')
db.from('users').select('*')
db.rpc(
  'get_user_balance',
  {},
)
db.storage.from('images').getPublicUrl('fixture')
db.auth.getUser()
db.channel('updates')
const edge = '/functions/v1/synclabs-video'
void edge
`
  )

  const first = run(process.execPath, [inventoryPath, '--source', src])
  const second = run(process.execPath, [inventoryPath, '--source', src])
  assert.equal(first.status, 0, first.stderr)
  assert.equal(second.status, 0, second.stderr)
  assert.equal(first.stdout, second.stdout)

  const manifest = JSON.parse(first.stdout)
  assert.deepEqual(manifest.tables, ['users'])
  assert.deepEqual(manifest.rpc, ['get_user_balance'])
  assert.deepEqual(manifest.storageBuckets, ['images'])
  assert.deepEqual(manifest.edgeFunctions, ['synclabs-video'])
  assert.deepEqual(manifest.features, ['auth', 'realtime'])
  assert.deepEqual(manifest.unclassifiedDynamic, [])
})

test('source consumer manifest fails closed on dynamic table and storage seams', t => {
  const root = tempRoot(t)
  const src = join(root, 'src')
  secureDir(src)
  writeFileSync(
    join(src, 'dynamic.ts'),
    `import { createClient } from '@supabase/supabase-js'
const db = createClient('fixture', 'fixture')
db.from(tableName).select('*')
db.storage.from(bucketName).getPublicUrl('fixture')
`
  )
  const result = run(process.execPath, [inventoryPath, '--source', src])
  assert.equal(result.status, 2)
  const manifest = JSON.parse(result.stdout)
  assert.deepEqual(
    manifest.unclassifiedDynamic.map(item => item.kind),
    ['storage', 'table']
  )
  assert.doesNotMatch(result.stderr, /tableName|bucketName/)
})

test('source consumer manifest uses locale-independent code-point ordering', t => {
  const root = tempRoot(t)
  const src = join(root, 'src')
  secureDir(src)
  for (const file of ['Z-consumer.ts', 'a-consumer.ts']) {
    writeFileSync(
      join(src, file),
      `import { createClient } from '@supabase/supabase-js'
const db = createClient('fixture', 'fixture')
db.from(tableName).select('*')
`
    )
  }

  const result = run(process.execPath, [inventoryPath, '--source', src])
  assert.equal(result.status, 2)
  const manifest = JSON.parse(result.stdout)
  assert.deepEqual(
    manifest.unclassifiedDynamic.map(item => item.file),
    ['Z-consumer.ts', 'a-consumer.ts']
  )
})

test('backup streams custom pg_dump directly into recipient encryption and hashes ciphertext', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)
  const result = run(backupPath, [], env)
  assert.equal(result.status, 0, result.stderr)

  const encrypted = join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg')
  assert.equal(readFileSync(encrypted, 'utf8'), 'PGDMP-fixture-bytes')
  assert.ok(existsSync(`${encrypted}.sha256`))
  const checksum = readFileSync(`${encrypted}.sha256`, 'utf8')
  assert.match(checksum, /  source\.dump\.gpg\s*$/)
  assert.doesNotMatch(
    checksum,
    new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  )
  assert.equal(
    existsSync(join(env.MIGRATION_EVIDENCE_DIR, 'source.dump')),
    false
  )
  assert.equal(
    existsSync(join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg.partial')),
    false
  )

  const calls = readFileSync(env.FAKE_LOG, 'utf8')
  assert.match(calls, /psql .*--no-password/)
  assert.match(calls, /pg_dump .*--no-password/)
  assert.match(calls, /pg_dump .*--format=custom/)
  assert.match(calls, /pg_dump .*--dbname=service=source_fixture/)
  assert.match(calls, /gpg .*--recipient fixture-recipient/)
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /source_fixture|fixture-recipient|pgpass/
  )
})

test('backup blocks unsupported source major before producing ciphertext', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin, {
    FAKE_SOURCE_MAJOR: '190000',
    FAKE_CLIENT_VERSION: '18.1',
  })
  const result = run(backupPath, [], env)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unsupported/i)
  assert.equal(
    existsSync(join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg')),
    false
  )
  const calls = readFileSync(env.FAKE_LOG, 'utf8')
  assert.doesNotMatch(calls, /gpg /)
})

test('backup refuses a pre-existing partial path without following it', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)
  const victim = join(root, 'must-not-change')
  secureFile(victim, 'unchanged')
  symlinkSync(
    victim,
    join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg.partial')
  )

  const result = run(backupPath, [], env)
  assert.notEqual(result.status, 0)
  assert.equal(readFileSync(victim, 'utf8'), 'unchanged')
  assert.equal(
    existsSync(join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg.partial')),
    true
  )
  assert.doesNotMatch(readFileSync(env.FAKE_LOG, 'utf8'), /gpg /)
})

test('backup preserves every pre-existing destination artifact on refusal', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)
  const final = join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg')
  const checksum = `${final}.sha256`
  secureFile(final, 'existing-ciphertext')
  secureFile(checksum, 'existing-checksum')

  const result = run(backupPath, [], env)
  assert.notEqual(result.status, 0)
  assert.equal(readFileSync(final, 'utf8'), 'existing-ciphertext')
  assert.equal(readFileSync(checksum, 'utf8'), 'existing-checksum')
  assert.equal(readFileSync(env.FAKE_LOG, 'utf8'), '')
})

test('catalog snapshot encrypts only complete canonical read-only output', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)

  const complete = run(snapshotPath, [], env)
  assert.equal(complete.status, 0, complete.stderr)
  const encrypted = join(env.MIGRATION_EVIDENCE_DIR, 'catalog.ndjson.gpg')
  assert.ok(existsSync(encrypted))
  assert.ok(existsSync(`${encrypted}.sha256`))
  assert.equal(
    readFileSync(encrypted, 'utf8'),
    '{"kind":"server","server_version_num":"170000"}\n' +
      '{"kind":"snapshot_complete","value":true}\n'
  )
  assert.doesNotMatch(
    complete.stdout + complete.stderr,
    /source_fixture|fixture-recipient|pgpass/
  )
  assert.match(readFileSync(env.FAKE_LOG, 'utf8'), /psql .*--no-password/)

  rmSync(encrypted)
  rmSync(`${encrypted}.sha256`)
  const partial = run(snapshotPath, [], { ...env, FAKE_PARTIAL: '1' })
  assert.notEqual(partial.status, 0)
  assert.equal(existsSync(encrypted), false)
  assert.equal(existsSync(`${encrypted}.partial`), false)
})

test('catalog snapshot preserves every pre-existing destination artifact on refusal', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)
  const final = join(env.MIGRATION_EVIDENCE_DIR, 'catalog.ndjson.gpg')
  const checksum = `${final}.sha256`
  const partial = `${final}.partial`
  secureFile(final, 'existing-catalog-ciphertext')
  secureFile(checksum, 'existing-catalog-checksum')
  secureFile(partial, 'existing-catalog-partial')

  const result = run(snapshotPath, [], env)
  assert.notEqual(result.status, 0)
  assert.equal(readFileSync(final, 'utf8'), 'existing-catalog-ciphertext')
  assert.equal(readFileSync(checksum, 'utf8'), 'existing-catalog-checksum')
  assert.equal(readFileSync(partial, 'utf8'), 'existing-catalog-partial')
  assert.equal(readFileSync(env.FAKE_LOG, 'utf8'), '')
})

test('restore requires an explicit disposable target and uses fail-fast pg_restore', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)
  const encrypted = join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg')
  secureFile(encrypted, 'PGDMP-fixture-bytes')
  const checksum = execFileSync('shasum', ['-a', '256', 'source.dump.gpg'], {
    cwd: env.MIGRATION_EVIDENCE_DIR,
    encoding: 'utf8',
  })
  secureFile(`${encrypted}.sha256`, checksum)

  const restoreEnv = {
    ...env,
    RESTORE_INPUT: encrypted,
    RESTORE_PGSERVICE: 'trinity_root_restore_fixture',
    RESTORE_PGPASSFILE: env.SOURCE_PGPASSFILE,
    RESTORE_TARGET_KIND: 'disposable',
  }
  const blocked = run(restorePath, [], restoreEnv)
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /RESTORE_TARGET_ACK/)

  const restored = run(restorePath, [], {
    ...restoreEnv,
    RESTORE_TARGET_ACK: 'I_UNDERSTAND_THIS_TARGET_IS_DISPOSABLE',
  })
  assert.equal(restored.status, 0, restored.stderr)
  const calls = readFileSync(env.FAKE_LOG, 'utf8')
  assert.match(calls, /gpg .*--decrypt/)
  assert.match(calls, /pg_restore .*--exit-on-error/)
  assert.match(calls, /pg_restore .*--single-transaction/)
  assert.match(calls, /pg_restore .*--no-password/)
  assert.match(
    calls,
    /pg_restore .*--dbname=service=trinity_root_restore_fixture/
  )
  assert.doesNotMatch(
    restored.stdout + restored.stderr,
    /trinity_root_restore_fixture|fixture-recipient|pgpass/
  )
})

test('restore rejects a checksum sidecar for any file other than the selected ciphertext', t => {
  const root = tempRoot(t)
  const bin = makeFakeBin(root)
  const env = fakeEnv(root, bin)
  const encrypted = join(env.MIGRATION_EVIDENCE_DIR, 'source.dump.gpg')
  const other = join(env.MIGRATION_EVIDENCE_DIR, 'other.dump.gpg')
  secureFile(encrypted, 'selected-ciphertext')
  secureFile(other, 'different-ciphertext')
  const wrongChecksum = execFileSync(
    'shasum',
    ['-a', '256', 'other.dump.gpg'],
    {
      cwd: env.MIGRATION_EVIDENCE_DIR,
      encoding: 'utf8',
    }
  )
  secureFile(`${encrypted}.sha256`, wrongChecksum)

  const result = run(restorePath, [], {
    ...env,
    RESTORE_INPUT: encrypted,
    RESTORE_PGSERVICE: 'trinity_root_restore_fixture',
    RESTORE_PGPASSFILE: env.SOURCE_PGPASSFILE,
    RESTORE_TARGET_KIND: 'disposable',
    RESTORE_TARGET_ACK: 'I_UNDERSTAND_THIS_TARGET_IS_DISPOSABLE',
  })

  assert.notEqual(result.status, 0)
  assert.doesNotMatch(readFileSync(env.FAKE_LOG, 'utf8'), /gpg |pg_restore /)
})
