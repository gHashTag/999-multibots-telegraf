/**
 * THE CODING SCIENTIST GETS HANDS (owner, 2026-09-26: "the programmer --
 * make it a scientist").
 *
 * A program shown as prose is a claim; a program that printed what it printed
 * is a result. `code_run` runs what the agent wrote and returns the tool's
 * own output, so the coder can say "checked" only about code that actually
 * ran -- the same rule the RTL and FPGA engineers keep with hdl_run.
 *
 * THE CODE IS UNTRUSTED, exactly as the Verilog is (hdl-run.ts):
 *   - it runs under Deno with EVERY permission denied and --no-prompt, so a
 *     request for the disk, the network, the environment or a subprocess is
 *     an error, not a prompt (measured 2026-09-26: read/env/net/run and
 *     remote/npm imports all refused);
 *   - --no-remote and --no-npm: no code is fetched, only what was handed in;
 *   - the child gets an EMPTY environment (PATH and HOME only, HOME the run's
 *     own directory) and its DENO_DIR is that directory, so it shares no cache;
 *   - when the server is root (the image is) it runs as nobody, which cannot
 *     open the server's /proc/<pid>/environ -- the secrets -- whatever a
 *     permission slip might miss;
 *   - a deadline, a bounded output, and a per-person hourly budget.
 *
 * TypeScript and JavaScript run under Deno, whose permission model is the
 * strongest here (subprocess itself is denied). PYTHON has no such model, so
 * it is boxed the way the HDL tools are: `unshare -rn` gives it a network
 * namespace with no interfaces (measured 2026-09-26: a socket to 1.1.1.1 is
 * refused), it runs as nobody in an empty environment (so it cannot read the
 * server's /proc/<pid>/environ -- the secrets), and `prlimit` caps its CPU,
 * address space and file writes. Unlike Deno it may spawn a subprocess and
 * read a world-readable file, exactly the bar the iverilog/yosys tools
 * already run at -- no network, no secrets, bounded. The strong per-call
 * permission story stays Deno's; a person who needs that writes ts/js.
 */
import { execFile as execFileCb } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTool, ToolContext } from './tools'
import {
  type Exec,
  type ExecResult,
  giveToSandbox,
  sandboxIds,
} from './hdl-run'

export const CODE_LANGS = ['ts', 'js', 'py'] as const
export type CodeLang = (typeof CODE_LANGS)[number]
/** Spellings a person may use for a language, mapped to its canonical id. */
const ALIASES: Readonly<Record<string, CodeLang>> = {
  ts: 'ts',
  typescript: 'ts',
  js: 'js',
  javascript: 'js',
  py: 'py',
  python: 'py',
  python3: 'py',
}

export const MAX_BYTES = 64 * 1024
export const RUNS_PER_HOUR = 40
export const OUTPUT_CHARS = 8000
export const DEADLINE_MS = 10_000
/**
 * CPU seconds, address space (1 GiB) and file writes (64 MiB) for python.
 * The byte counts are built from small factors on purpose: a bare ten-digit
 * byte count reads to the no-dossier guard as a Telegram id.
 */
const MiB = 1024 * 1024
const PRLIMIT = ['--cpu=15', `--as=${1024 * MiB}`, `--fsize=${64 * MiB}`]

const FILE = (lang: CodeLang) => `main.${lang}`

/**
 * The command for a language. Ours, never the request's. Pure.
 *
 * ts/js: Deno, every permission denied. py: `unshare -rn` (a network
 * namespace with no interfaces) around `prlimit` around python, run with
 * `-I -S -B` so it ignores the environment, site and PYTHONPATH and writes no
 * bytecode. The empty environment and the nobody uid come from execCode.
 */
export function commandFor(
  lang: CodeLang,
  dir: string
): { cmd: string; args: string[] } {
  if (lang === 'py')
    return {
      cmd: 'unshare',
      args: [
        '-rn', // rootless user namespace + a fresh network namespace: no network
        'prlimit',
        ...PRLIMIT,
        'python3',
        '-I', // isolated: ignore env, PYTHONPATH, user site; implies -E -s
        '-S', // no site module
        '-B', // no .pyc written
        join(dir, FILE(lang)),
      ],
    }
  return {
    cmd: 'deno',
    args: [
      'run',
      '--no-prompt', // a permission request is an error, never a prompt
      '--no-remote', // no code fetched over the network
      '--no-npm', // no npm specifiers
      '--no-config',
      '--no-lock',
      '--quiet',
      join(dir, FILE(lang)),
    ],
  }
}

/** In memory, per person: runs in the current hour. Shared shape with hdl_run. */
const runs = new Map<string, { hour: number; n: number }>()
export function resetCodeBudgetForTests(): void {
  runs.clear()
}
export function allowRun(who: string, nowMs: number): boolean {
  const hour = Math.floor(nowMs / 3_600_000)
  const r = runs.get(who)
  if (!r || r.hour !== hour) {
    runs.set(who, { hour, n: 1 })
    return true
  }
  r.n += 1
  return r.n <= RUNS_PER_HOUR
}

/** The real runner: no permissions, empty env, its own cache dir, as nobody. */
export const execCode: Exec = (cmd, args, opts) =>
  new Promise<ExecResult>(resolve => {
    execFileCb(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        maxBuffer: 512 * 1024,
        killSignal: 'SIGKILL',
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          HOME: opts.cwd,
          DENO_DIR: join(opts.cwd, '.deno'),
          NO_COLOR: '1',
        },
        ...(sandboxIds() ?? {}),
      },
      (err, stdout, stderr) => {
        const e = err as
          | (NodeJS.ErrnoException & { killed?: boolean; code?: unknown })
          | null
        resolve({
          code: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          timedOut: Boolean(e?.killed),
          missing: e?.code === 'ENOENT',
        })
      }
    )
  })

const clip = (s: string) =>
  s.length > OUTPUT_CHARS
    ? `${s.slice(0, OUTPUT_CHARS)}\n… (${s.length - OUTPUT_CHARS} more chars)`
    : s

/** The language a request asks for, or a reason it cannot run. Pure. */
export function langOf(
  raw: unknown
): { ok: true; lang: CodeLang } | { ok: false; reason: string } {
  const l = String(raw ?? 'ts')
    .trim()
    .toLowerCase()
  const canon = ALIASES[l]
  if (canon) return { ok: true, lang: canon }
  return { ok: false, reason: 'lang: ts | js | py' }
}

export async function runCode(
  args: Record<string, unknown>,
  ctx: ToolContext | undefined,
  deps: { exec?: Exec; now?: () => number } = {}
): Promise<Record<string, unknown>> {
  const who = String(ctx?.telegramId ?? '')
  if (!who) throw new Error('who is asking?')
  const lang = langOf(args.lang)
  if (!lang.ok) return { ran: false, reason: lang.reason }
  const code = String(args.code ?? '')
  if (!code.trim()) return { ran: false, reason: 'code: the program to run' }
  if (Buffer.byteLength(code) > MAX_BYTES)
    return { ran: false, reason: `code over ${MAX_BYTES} bytes` }
  if (!allowRun(who, (deps.now ?? Date.now)()))
    return {
      ran: false,
      reason: `${RUNS_PER_HOUR} runs an hour per person -- try later`,
    }
  const exec = deps.exec ?? execCode
  const dir = await mkdtemp(join(tmpdir(), 'code-'))
  try {
    const file = join(dir, FILE(lang.lang))
    await writeFile(file, code)
    await giveToSandbox([dir, file])
    const { cmd, args: cmdArgs } = commandFor(lang.lang, dir)
    const r = await exec(cmd, cmdArgs, { cwd: dir, timeoutMs: DEADLINE_MS })
    if (r.missing)
      return {
        ran: false,
        reason: `${cmd} is not installed in the service -- say "не запускалось", do not guess the output`, // cyrillic-ok: tool answer
      }
    const output = clip(`${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`.trim())
    return {
      ran: true,
      lang: lang.lang,
      exit: r.code,
      ...(r.timedOut ? { timedOut: true } : {}),
      passed: r.code === 0 && !r.timedOut,
      output,
      note: "the program's own output, as it printed it: quote it, do not round it",
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const CODE_TOOLS: AgentTool[] = [
  {
    name: 'code_run',
    description:
      'Run a program in a sandbox and get its real output. lang ts or js: ' +
      'Deno with every permission denied (no network, no disk, no environment, ' +
      'no subprocess). lang py: Python with no network, as nobody, an empty ' +
      'environment and capped CPU/memory. All: a 10s deadline. Use it to check ' +
      'what you write before you answer, and quote the output. Free, 40 runs an hour.',
    parameters: {
      type: 'object',
      properties: {
        lang: { type: 'string', enum: [...CODE_LANGS] },
        code: { type: 'string', description: 'the program to run' },
      },
      required: ['code'],
      additionalProperties: false,
    },
    handler: (args, ctx) => runCode(args, ctx as ToolContext),
  },
]
