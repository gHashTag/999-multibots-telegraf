/**
 * Credentials are not intent.
 *
 * Five files under src/__tests__ are not tests at all: they are one-off data
 * migrations wearing a .test.ts suffix. They pull SUPABASE_SERVICE_ROLE_KEY
 * from Infisical at runtime and batch-insert rows into the live payments_v2.
 *
 * The only thing standing between `npm test` and those inserts was
 * `describe.skipIf(!HAS_INFISICAL)` -- that is, the AMBIENT PRESENCE of
 * credentials. Anyone whose shell happens to carry Infisical vars (the loop
 * itself loads them to measure production) re-runs a historical money
 * migration by running the test suite.
 *
 * What the migrations actually do bounds the damage honestly: each one selects
 * the ids present in payments_v2_backup and missing from payments_v2, then
 * inserts only those. On healthy data the set is empty and nothing is written.
 * The real exposure is a row deleted from the main table ON PURPOSE: the suite
 * would silently restore it, and the deletion would look like it never
 * happened.
 *
 * So the gate now asks for intent as well as capability. Without this flag the
 * blocks skip exactly as they do today; CI never sets it, and neither does the
 * loop. Running a migration stays possible -- it just has to be asked for.
 *
 * This mirrors a defect already fixed on the request path (#1665), where the
 * mere presence of an x-api-key header was read as permission to skip
 * charging. Presence of a credential is not authorisation to act.
 */
export const PROD_WRITES_ALLOWED = process.env.ALLOW_PROD_DATA_WRITES === '1'
