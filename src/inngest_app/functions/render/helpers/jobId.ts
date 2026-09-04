import { NonRetriableError } from 'inngest'

/**
 * job_id is interpolated into commands that ssh2 runs through a REMOTE shell,
 * in both render pipelines:
 *
 *   steps.ts       rm -rf /renders/job_${job_id}          (POSIX, unquoted)
 *   renderSteps.ts mkdir "${RenderConfig.getJobDir(id)}"  (Windows, quoted)
 *
 * and the event schema puts no format on it: schemas.ts declares
 * `job_id: z.string().min(1)`.
 *
 * Quoting is not equivalent to validating. The quoted form survives a space
 * but not a double quote, which closes the argument and hands the rest of the
 * string to the remote interpreter. So the value is checked rather than the
 * quoting, once, for both pipelines.
 *
 * Every job_id production generates is already inside this charset --
 * `telegram-<id>-<ts>` from render-server-client, `morphing_<id>_<ts>` from
 * morphImages -- so this refuses nothing that exists today. That is what makes
 * it safe to add: it can only refuse, and never widens what runs.
 */
const SHELL_SAFE_JOB_ID = /^[A-Za-z0-9._-]+$/

export function assertShellSafeJobId(job_id: string): void {
  if (!SHELL_SAFE_JOB_ID.test(job_id)) {
    throw new NonRetriableError(
      `Refusing to build a remote command from an unsafe job_id: ${JSON.stringify(job_id)}`
    )
  }
}
