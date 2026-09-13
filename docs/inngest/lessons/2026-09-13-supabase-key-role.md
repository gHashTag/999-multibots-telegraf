# Lesson 2026-09-13: pick the Supabase key by its role, not by its name

## What was observed (Railway production, read through the owner's browser)

* Log explorer, 7 days, service `999-multibots-telegraf`: every new user with a Telegram photo hit
  `[getUserPhotoUrl] Не удалось переложить фото — адрес с токеном не отдаём`, preceded by
  `[mirror] ... error: "storage: new row violates row-level security policy"`. Users without a
  photo skipped the branch. Nobody reached `Welcome avatar generation triggered`.
* Inngest server, `eventsV2`, 7 days: zero non-internal events. `inngest.send` for
  `welcome-avatar-generate` lives *after* the mirror call in `createUserScene.ts`, so the RLS
  failure is sufficient to explain the silence. It is the only witnessed cause; other producers
  (`KieAiProvider`, `uploadTrainFluxModelScene`, `replicate-webhook`) may simply have had no
  traffic — that was not verified.
* Variables page of the bot service (values decoded in-page, never printed):
  `SUPABASE_SERVICE_KEY` is a JWT with `role: anon`; `SUPABASE_SERVICE_ROLE_KEY` is a JWT with
  `role: service_role`; both for the same project ref.
* `src/core/supabase/client.ts` preferred `SUPABASE_SERVICE_KEY` by name. Under `anon` the
  `images` bucket policy rejected `storage.upload`.
* Inngest wiring itself was consistent: `INNGEST_BASE_URL` to the internal service,
  `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` identical on both services, no
  `Failed to send event` in 7 days.

## The fix

`selectSupabaseServiceKey(env)` decodes the JWT `role` of both candidates and takes the one that
says `service_role`; when neither decodes, it falls back to `SUPABASE_SERVICE_ROLE_KEY`, then
`SUPABASE_SERVICE_KEY`. `getSupabaseKey()` warns once when the chosen role is not `service_role`.
`supabaseAdmin` uses the same selector. Tests: `src/__tests__/core/supabaseKeySelection.test.ts`.

No Railway variable was changed; the code now tolerates the swapped names.

## Rules to keep

1. A variable name is a label; the JWT payload is the fact. Decode `role` before trusting a key
   for server-side writes.
2. When a whole event family is silent, look at the producer's *preconditions* (the code before
   `inngest.send`) before suspecting the queue.
3. Read production logs with the owner's browser session; do not ask for tokens.
4. Never print a secret to verify it: decode in-page, print only the role and the project ref.

## Not verified yet

* The production effect: until this branch is deployed there is no `[mirror] Файл переложен`
  line to point at. After deploy, check the log explorer for that line and `eventsV2` for
  `welcome-avatar-generate` events.
* Whether the other anon-client storage callers (`src/core/supabase/video.ts`,
  `src/helpers/uploadTelegramFile.ts`, `voiceTrainingWizard/index.ts`, `cleanupOldArchives.ts`,
  `deleteFileFromSupabase.ts`) were also failing: they share the client, so the fix applies, but
  no log line for them was read.
* The meaning of the warning badge "3" on the bot service in the Railway UI.
