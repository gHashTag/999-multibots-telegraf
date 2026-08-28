/**
 * Deterministic environment for `bun test`.
 *
 * WHY. Without these variables the failures were not about the code: the
 * payment wizard aborted with a config error before reaching the logic under
 * test, the image generator did the same, and the lip-sync provider threw
 * "KIE_AI_API_KEY is not set" on entry. The run measured whether the person
 * running it happened to have a working .env, not how the code behaves.
 *
 * The values are deliberately non-working: a test that reaches a real call
 * with them must fail rather than quietly talk to production. A real value
 * from the environment wins, so integration runs are unaffected.
 *
 * This used to live as one long line inside the test:bun script. package.json
 * cannot carry a comment, so neither this explanation nor the marker the
 * secret guard requires had anywhere to live.
 *
 * secret-guard-ok: test placeholders, not secrets — none of these grants
 * access to anything.
 */
const defaults: Record<string, string> = {
  SUPABASE_URL: 'TEST_URL',
  SUPABASE_SERVICE_KEY: 'TEST_KEY',
  MERCHANT_LOGIN: 'test_merchant',
  ROBOKASSA_PASSWORD_1: 'test_pass_1',
  ROBOKASSA_PASSWORD_2: 'test_pass_2',
  FAL_KEY: 'test_fal_key',
  KIE_AI_API_KEY: 'test_kie_key',
  ELEVENLABS_API_KEY: 'test_eleven_key',
}

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) process.env[key] = value
}
