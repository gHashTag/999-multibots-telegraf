# Root Supabase exit runbook

Status: additive tooling only. No production copy or cutover has been run.

This runbook covers the root Telegram service. The independently releasable
player/render lane is separate and must remain pinned to its reviewed commit
topology. Root is not part of SAFE BETA deployment until every gate below is
green on exact reviewed evidence.

## Current safe command

Run the offline contract suite without database or object-store credentials:

```sh
make test-root-migration-contract
```

The target validates backup/restore command contracts, the four-table
relational classifier, immutable object manifests, reconciliation, create-only
copy semantics, and the append-only resume ledger. It performs no network
request and cannot copy production data.

## Owner-controlled prerequisites

Production evidence collection remains blocked until all of the following are
available outside the repository:

- a read-only direct PostgreSQL service definition for the authoritative
  source and its `PGPASSFILE` with mode `0600`;
- a destination/disposable-restore service definition that cannot resolve to
  the source or production writer;
- a GPG recipient whose private key is available for the restore drill;
- least-privilege read access to source Storage and create-only access to the
  Railway object store;
- an evidence directory outside the repository with mode `0700`;
- a recorded writer-freeze or dual-write strategy before any apply step.

Do not paste connection strings, passwords, service-role keys, object-store
keys, Telegram IDs, or GPG private-key material into a command, issue, chat,
repository file, DOM, clipboard payload, or log.

## Read-only catalog and encrypted backup

After the prerequisites are provisioned locally, export only references to the
out-of-repository service files and recipient. Do not echo their values.

```sh
export MIGRATION_EVIDENCE_DIR=/absolute/private/evidence-directory
export SOURCE_PGSERVICE=source_read_only
export SOURCE_PGPASSFILE=/absolute/private/pgpass
export BACKUP_RECIPIENT=owner-controlled-recipient

scripts/supabase-exit/snapshot-catalog.sh
scripts/supabase-exit/backup-source.sh
```

Both commands are fail-closed, use read-only database settings, write only
encrypted artifacts plus ciphertext checksums, and reject output inside the
repository. Their success is not a restore proof.

Run restore only against a verified disposable database. This is intentionally
an explicit owner gate because it mutates that disposable target:

```sh
export RESTORE_INPUT=/absolute/private/evidence-directory/source.dump.gpg
export RESTORE_PGSERVICE=isolated_restore_fixture
export RESTORE_PGPASSFILE=/absolute/private/restore-pgpass
export RESTORE_TARGET_KIND=disposable
export RESTORE_TARGET_ACK=I_UNDERSTAND_THIS_TARGET_IS_DISPOSABLE

scripts/supabase-exit/restore-drill.sh
```

The restore still requires logical count/checksum/constraint verification
before it counts as a migration gate.

### Historical plain-SQL evidence route

A provider-exported `.sql.gz` is accepted only as historical schema evidence
when its age makes it non-authoritative. Before any local restore, record and
verify its compressed SHA-256, gzip integrity, uncompressed byte bound, dump
header, and completion trailer. Do not route a plain SQL dump through
`pg_restore`.

The bounded local restore contract is:

- create a fresh disposable PostgreSQL instance with no published host port,
  no Railway/Supabase credentials, and no shared production volume;
- stream `gzip -cd` directly into `psql -X --no-psqlrc -v ON_ERROR_STOP=1`;
- reject any target not explicitly marked disposable and reject inherited
  `PGPASSWORD`;
- keep the instance local and isolated; never substitute Railway as the
  restore target;
- run catalog/row extraction through a dedicated read-only role and an exact
  `PGSERVICE`/`PGPASSFILE` reference;
- emit canonical typed text for exactly `users`, `payments_v2`, `jobs`, and
  `assets`, or fail closed when a table/catalog proof is absent;
- destroy the disposable instance only after the encrypted/schema-only
  evidence manifest has been sealed and verified.

Historical row counts or schemas never authorize a data copy. A missing table,
type mismatch, non-current snapshot, partial restore, extractor truncation, or
unavailable current destination evidence leaves every copy/cutover gate false.

## Relational reconciliation

Generate each side independently through a named libpq service and a private
password file; the extractor never accepts a connection URL or password value:

```sh
umask 077
set -o noclobber
export SOURCE_PGSERVICE=source_read_only
export SOURCE_PGPASSFILE=/absolute/private/source-pgpass
scripts/migrations/root-relational/pgservice-extract.cjs --side source \
  > /absolute/private/evidence-directory/source-root-snapshot.json

export DESTINATION_PGSERVICE=destination_read_only
export DESTINATION_PGPASSFILE=/absolute/private/destination-pgpass
scripts/migrations/root-relational/pgservice-extract.cjs --side destination \
  > /absolute/private/evidence-directory/destination-root-snapshot.json
```

Both `PGPASSFILE` files must be regular, non-symlink files outside the
repository with mode `0600`. The extractor starts one repeatable-read,
read-only transaction, requires a completion sentinel, applies byte/row/time
bounds, and emits nothing on a partial or failed snapshot. Keep the resulting
files outside the repository at new, never-overwritten paths with owner-only
permissions; they contain row evidence even though errors and reconciliation
summaries are redacted.

The classifier accepts typed-text JSON on stdin only. It never connects to a
database or applies rows. Its input must be generated from the encrypted,
versioned authoritative catalog and must include the mandatory deep tables:
`users`, `payments_v2`, `jobs`, and `assets`.

The production adapter is deliberately not enabled yet. Until catalog
provenance, sequence/FK evidence, an encrypted detailed conflict manifest, and
resumable apply ledger exist, a redacted classifier result is diagnostic only.
In particular:

- `ON CONFLICT DO NOTHING` is not reconciliation;
- destination-only rows are preserved;
- source-only rows are not copied until the authoritative side is declared;
- identity or financial conflicts stop the run;
- no row identifier or value appears in normal output.

## Object reconciliation

The object tooling seals a deterministic manifest containing bucket/key,
bytes, SHA-256, MIME, source version, and orphan state. Public summaries expose
counts and bytes only. The historical observation of 82 source-only `images`
objects is not an expected count; a fresh sealed manifest is mandatory.

The copy primitive is intentionally dependency-injected and has no configured
production credentials. When a reviewed adapter is added, it must retain these
invariants:

- copy only `source_only` entries after a conflict-free dry run;
- spool and verify source bytes before upload rather than buffering blobs in
  PostgreSQL or memory;
- use create-only `If-None-Match: *`, never unconditional overwrite;
- treat access errors and timeouts as fatal, not as missing objects;
- verify destination size, SHA-256, and MIME after upload;
- recover a concurrent create only when the destination verifies equal;
- resume only from the manifest-bound hash-chained ledger;
- never delete source-only, destination-only, conflicting, or orphaned data.

## Cutover gate

Root cutover remains blocked until all of these facts are recorded for one
exact candidate:

1. encrypted source backup and successful disposable restore with logical
   verification;
2. authoritative catalog/ledger and regenerated relational/object manifests;
3. explicit disposition for every bidirectional row conflict;
4. second object dry run with zero missing/conflicting objects;
5. counts, checksums, PK, sequence, FK, owner-link, object bytes/SHA/MIME, and
   orphan reconciliation;
6. signed idempotent replacement for the `synclabs-video` Edge Function;
7. writer freeze or dual-write drain proof;
8. root scoped identity/ownership/payment/business invariant suite;
9. startup zero-Supabase guard, zero-egress canary, artifact scan, and
   independent P0/P1 review;
10. post-cutover health and rejection proof before old credentials are
    revoked.

Rollback may switch application preference or the stable media origin, but it
must preserve post-cutover writes and both object stores. It never restores an
exposed/revoked credential or overwrites newer data with an old snapshot.
