# Supabase exit contract

Status: implementation contract, not a cutover record.

Operational commands and owner-controlled prerequisites are documented in
[`ROOT_SUPABASE_EXIT_RUNBOOK.md`](./ROOT_SUPABASE_EXIT_RUNBOOK.md). The root
offline classifiers intentionally report no production readiness until their
evidence is derived from an authenticated catalog and a restore-proven backup.

This migration removes Supabase as a production runtime dependency without
changing the server-owned Telegram identity model. It is complete only when
the relevant service has passed its own cutover gate. A green player/render
lane does not imply that the root Telegram service has left Supabase.

## Release lanes

1. `player/render` is layered after SAFE BETA commit
   `75344a0b46e50b660bfcb157a5451743ddc01bd8`. It may be released without the
   root service. It uses Railway PostgreSQL and S3-compatible storage, exposes
   stable `/media/<key>` URLs, and fails startup in production if a Supabase
   host or credential variable remains.
2. `root` is a separate release. It replaces `supabase-js` domain calls with
   parameterized PostgreSQL repositories, Storage with the Railway MinIO
   service, and the `synclabs-video` Edge Function with a signed, idempotent
   application webhook. Root is not deployed until its scoped identity,
   ownership, payment, and business-invariant suite is green.
3. The private PostgREST/gateway stack is a time-bounded compatibility bridge,
   not the final architecture. It must never expose a broad service-role JWT
   publicly.

## Immutable safety boundaries

- Telegram identity is verified from signed `@t27ai_bot` initData on the
  server. A body, path, query, MCP argument, or client cache cannot choose the
  owner.
- SAFE BETA exposes only `whoami`, `feed_stats`, and
  `content_plan_prepare`; the last operation creates drafts only.
- Paid generation, charges, render, publish/autopublish, approvals, and raw
  MCP-key issuance remain disabled.
- Blobs are not stored in PostgreSQL. Media lives in the Railway S3-compatible
  service behind `/media`.
- No migration step deletes source or destination data. No rollback restores a
  credential that was exposed or revoked.
- Production mutation begins only after encrypted backup and restore proof,
  dry-run reconciliation, an exact reviewed diff, and an explicit release
  gate.

## Relational manifest

The authoritative schema dump and migration ledger are versioned. Every table
manifest records, without printing owner identifiers to normal logs:

- source/destination schema fingerprints and primary-key columns;
- source-only, destination-only, equal, and true-conflict counts;
- canonical field-level diffs for conflicts;
- owner-link validation, foreign-key orphans, and constraint state;
- sequence name, maximum key, and next value;
- deterministic row checksums over typed text representations;
- manifest version, source snapshot time, destination snapshot time, and
  completion cursor.

`ON CONFLICT DO NOTHING` is not reconciliation. Destination-only rows are
preserved. Source-only rows are copied idempotently only when the manifest
declares the authoritative side. Conflicting identity or financial rows stop
the run and require separate evidence; they are never overwritten by a generic
upsert.

The first mandatory deep manifests are `users`, `payments_v2`, `jobs`, and
`assets`. The remaining tables must still pass count, checksum, PK, sequence,
FK, and owner-link checks.

Review evidence for exact candidate
`84f79a0216b8f5721b82b0785e9523a2a75e5041` observed relational drift in both
directions: source-only and destination-only rows were both present. That
observation is unresolved and asserts no current row counts. It is a hard
cutover blocker until a regenerated authoritative reconciliation classifies
every current delta and records an explicit disposition for every conflict.

## Object manifest

Before object copy, create an immutable, access-controlled manifest and an
off-platform backup. Each object entry contains bucket/key, byte size, SHA-256,
MIME type, source version/ETag when available, destination state, and orphan
classification. User-facing reports contain counts only.

Copy is missing-only. Existing equal objects are not overwritten;
destination-only objects are not deleted; size, digest, or MIME conflicts stop
the run. A successful apply is followed by a second dry run whose missing and
conflict counts are zero. MinIO requires a persistent volume, versioning,
tested restore, CORS, and correct GET/HEAD/Range behavior before cutover.
The application proxy exposes only an explicit public-prefix allowlist and
passive image/video/audio MIME types; private training references and active
HTML, JavaScript, or SVG content remain unreachable even when they share the
same physical bucket.

The observed pre-implementation snapshot is evidence, not a hardcoded target:
five buckets matched; `images` had 82 source-only objects and no size mismatch
or destination-only object. The manifest must be regenerated at the actual
copy gate.

## Writer transition

Before relational or object apply, choose and record exactly one safe writer
strategy:

- a bounded writer freeze with a verified drain; or
- dual-write with idempotency keys plus shadow reads and drift alarms.

The run is resumable from the ledger. The cutover is rejected if a writer can
bypass the selected strategy, if the source advanced beyond the snapshot, or
if post-cutover writes cannot be preserved during rollback.

## Webhook transition

The root SyncLabs callback uses a first-party HTTPS endpoint. Requests require
a versioned HMAC signature and timestamp, reject replays, persist a unique
provider event/job key, and produce the same result on retry. Raw bodies,
tokens, signatures, and media URLs are not logged. The old Edge Function URL is
removed before `SUPABASE_URL` is removed from root.

## Cutover gates

All applicable gates must be green on the exact candidate:

1. encrypted database and object backup, followed by a restore drill;
2. authoritative schema dump and applied versioned ledger;
3. dry-run manifests and explicit conflict disposition;
4. idempotent/resumable copy and second dry run with zero pending diff;
5. table counts/checksums, PK/sequence/FK/owner isolation;
6. object counts/bytes/SHA-256/MIME/orphans;
7. webhook and media URL replacement;
8. startup fail-closed on Supabase hosts/keys after cutover;
9. zero-egress canary and executable-artifact scan;
10. health, expected bot identity, owner isolation, and draft-only smoke;
11. exact-diff independent review with no P0/P1;
12. drain proof, old credential revocation, and read-only rejection proof.

## Rollback

Application rollback reverts only the cutover application commit/config and
keeps the non-revertable security prerequisite. Database rollback replays the
recorded post-cutover write journal or reverses the dual-write preference; it
does not restore an old snapshot over newer writes. Object rollback changes the
stable media origin and preserves both stores. Revoked or exposed credentials
are never restored. Unscanned pre-rotation artifacts are not valid rollback
targets.
