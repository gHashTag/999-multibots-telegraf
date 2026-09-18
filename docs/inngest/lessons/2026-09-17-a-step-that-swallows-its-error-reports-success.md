# A step that swallows its error reports success (2026-09-17)

Spec: t27 `specs/functions/render-job-run.t27`, `specs/functions/morph-images-generate.t27` (PR gHashTag/t27#4123).

## What happened

- `render-job-run`: `sendCallback` caught the axios error, logged it and returned. The `callback` step COMPLETED, the `try/catch` around it in `render.ts` was dead code, and the run said the render was delivered while the client never got the URL.
- `morph-images-generate`: `video_url` is a path on the worker. Telegraf received it as a string (file_id or URL), failed, and the fallback sent the user that path as a "download link" and returned `delivered: true`.
- The manifest and spec said `morph-images-generate` `charges-balance`; the file imports `getUserBalance` only and never deducts.

## Rules that follow

1. Inside `step.run`, a caught error that is not rethrown makes the step COMPLETE. Retries, `onFailure` and the dashboard all see success. Catch only to log, then rethrow.
2. A `try/catch` around `step.run` in the function body is reached only after the declared retries are spent. If it swallows, the run is a false success with no admin alert. Prefer letting the run fail: `onFailure` is the one place that tells the admin.
3. A fallback that gives the user something they cannot use (a server path) is not a delivery. Do not return `delivered: true` for it.
4. Local files go to Telegram as `{ source: path }`, never as the bare path.
5. `side_effects` in the manifest is read from the code, not from what the function is meant to do: a balance read is not `charges-balance`.

## Test trap

A vitest `beforeEach(() => mock.mockReset())` without braces returns the mock, which vitest calls as a cleanup function after the test -- with a rejecting mock that is an unhandled rejection blamed on the test. Write hooks with braces.

## Not verified

No live render or morph run; the deployed build was not exercised. The plan's `mkdir -p` for `create-job-folder` is not needed: Windows host, `ssh.exec` resolves on any exit code.
