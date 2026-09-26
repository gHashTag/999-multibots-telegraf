/**
 * THE ENGINEERS GET HANDS (owner, 2026-09-26: option 1 -- "give the
 * engineers hands").
 *
 * Until now the RTL and FPGA engineers could only write "не запускалось":
 * no tool ran a linter, a simulator or a synthesis. `hdl_run` runs the open
 * tools the service image carries -- verilator (lint), iverilog + vvp
 * (simulate a testbench), yosys synth_xilinx (resources) -- on the files the
 * agent wrote, in a fresh temporary directory, and returns their own output.
 *
 * THE SOURCE IS UNTRUSTED. A person can ask the agent to write anything, so
 * the Verilog is treated as an attacker's file:
 *   - no file I/O system task at all ($fopen, $readmem*, $dumpfile, $system
 *     ...): a testbench could otherwise read /proc/1/environ -- the server's
 *     secrets -- or write outside its directory;
 *   - `include only of a file handed in with it;
 *   - the tool commands are ours (a yosys script is never taken from the
 *     request), the top name is an identifier;
 *   - the child gets an EMPTY environment (PATH and HOME only), a deadline,
 *     a bounded output, and a per-person hourly budget.
 *
 * THE CHECK READS WHAT THE COMPILER READS (26.09, found by trying it). The
 * first version matched FORBIDDEN against the file as written, and a macro
 * pastes a name together after that check: `define SYS(a) $``a` then
 * `SYS(fopen)` compiled to $fopen, and vvp read /etc/hostname on this
 * container. So every run is first put through `iverilog -E`, the same
 * preprocessor the simulator uses; FORBIDDEN is matched against ITS output,
 * and synthesis reads that output rather than the raw files (yosys executes
 * $readmemh while it synthesises). And the tools no longer run as root:
 * inside the image the child is uid 65534, which cannot open
 * /proc/<pid>/environ of the server -- the secrets -- whatever gets past a
 * text check.
 * Nothing is charged: the cost is CPU seconds, and the budget bounds it.
 */
import { execFile as execFileCb } from 'node:child_process'
import { chown, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTool, ToolContext } from './tools'

export const HDL_MODES = ['lint', 'sim', 'synth'] as const
export type HdlMode = (typeof HDL_MODES)[number]

export const MAX_FILES = 8
export const MAX_BYTES = 64 * 1024
export const RUNS_PER_HOUR = 30
export const OUTPUT_CHARS = 6000
const DEADLINE_MS: Record<HdlMode, number> = {
  lint: 20_000,
  sim: 15_000,
  synth: 60_000,
}

export interface HdlFile {
  name: string
  content: string
}

const FILE_NAME = /^[A-Za-z0-9_]{1,40}\.(v|sv|vh|svh)$/
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,63}$/
/** Every system task that touches a file, a process or the environment. */
const FORBIDDEN =
  /\$(fopen|fclose|fdisplay[bho]?|fwrite[bho]?|fstrobe[bho]?|fmonitor[bho]?|fread|fgets|fgetc|fscanf|fseek|ftell|frewind|rewind|fflush|feof|ferror|ungetc|readmem[bh]|writemem[bh]|dumpfile|dumpvars|dumpports|dumpall|dumpon|dumpoff|dumpflush|dumplimit|system|value\$plusargs|test\$plusargs|sdf_annotate|save|restart|incsave|input|log|nolog|key|nokey)\b/

/**
 * The files as they may be run, or the reason they may not. Pure: the
 * whole safety of the run is decided here, before anything touches a disk.
 */
export function checkSources(
  raw: unknown
): { ok: true; files: HdlFile[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw) || !raw.length)
    return { ok: false, reason: 'files: at least one {name, content}' }
  if (raw.length > MAX_FILES)
    return { ok: false, reason: `at most ${MAX_FILES} files` }
  const files: HdlFile[] = []
  let bytes = 0
  for (const f of raw) {
    const name = String((f as HdlFile)?.name ?? '')
    const content = String((f as HdlFile)?.content ?? '')
    if (!FILE_NAME.test(name))
      return {
        ok: false,
        reason: `bad file name "${name.slice(0, 60)}": letters, digits, _ and .v/.sv/.vh/.svh`,
      }
    bytes += Buffer.byteLength(content)
    files.push({ name, content })
  }
  if (bytes > MAX_BYTES)
    return { ok: false, reason: `sources over ${MAX_BYTES} bytes` }
  if (new Set(files.map(f => f.name)).size !== files.length)
    return { ok: false, reason: 'two files with one name' }
  const names = new Set(files.map(f => f.name))
  for (const f of files) {
    const task = f.content.match(FORBIDDEN)
    if (task)
      return {
        ok: false,
        reason: `${f.name}: ${task[0]} is not allowed here (no file, process or environment access)`,
      }
    for (const m of f.content.matchAll(/`include\s*(["<])([^">\n]*)[">]/g))
      if (m[1] !== '"' || !names.has(m[2]))
        return {
          ok: false,
          reason: `${f.name}: \`include "${m[2].slice(0, 60)}" -- only a file handed in with this run`,
        }
    if (/`include\b(?!\s*")/.test(f.content))
      return {
        ok: false,
        reason: `${f.name}: \`include must name a file in quotes`,
      }
  }
  return { ok: true, files }
}

export interface Step {
  cmd: string
  args: string[]
  /** A report the tool writes into the run's directory, read back after. */
  report?: string
}

/** The files a tool is given: .v and .sv; headers come in by `include. */
export function sourceNames(files: readonly HdlFile[]): string[] {
  return files.filter(f => /\.s?v$/.test(f.name)).map(f => f.name)
}

/** What the preprocessor writes: the text every check is made against. */
export const PREPROCESSED = 'pre.v'

/** The macro-expanded text through the same preprocessor iverilog compiles with. */
export function preprocessStep(files: readonly HdlFile[]): Step {
  return {
    cmd: 'iverilog',
    args: ['-g2012', '-E', '-o', PREPROCESSED, ...sourceNames(files)],
  }
}

/** The commands for a mode. The script is ours, never the request's. Pure. */
export function commandsFor(
  mode: HdlMode,
  files: readonly HdlFile[],
  top: string | null,
  /** Synthesis reads the checked, preprocessed text instead of the raw files. */
  synthFrom?: string
): Step[] | { reason: string } {
  const sources = sourceNames(files)
  if (!sources.length) return { reason: 'no .v or .sv file to run' }
  if (top !== null && !IDENT.test(top))
    return { reason: `bad top "${top.slice(0, 40)}"` }
  const sv = sources.some(n => n.endsWith('.sv'))
  if (mode === 'lint')
    return [
      {
        cmd: 'verilator',
        args: [
          '--lint-only',
          '-Wall',
          '-Wno-DECLFILENAME',
          '-Wno-UNUSEDSIGNAL',
          ...(top ? ['--top-module', top] : []),
          ...sources,
        ],
      },
    ]
  if (mode === 'sim')
    return [
      {
        cmd: 'iverilog',
        args: [
          '-g2012',
          '-o',
          'sim.vvp',
          ...(top ? ['-s', top] : []),
          ...sources,
        ],
      },
      { cmd: 'vvp', args: ['-n', 'sim.vvp'] },
    ]
  if (!top) return { reason: 'synth needs top: the module to synthesise' }
  return [
    {
      cmd: 'yosys',
      args: [
        '-q',
        '-p',
        `read_verilog ${sv ? '-sv ' : ''}${synthFrom ?? sources.join(' ')}; synth_xilinx -top ${top}; tee -q -o stat.txt stat`,
      ],
      report: 'stat.txt',
    },
  ]
}

/** In memory, per person: runs in the current hour. */
const runs = new Map<string, { hour: number; n: number }>()
export function resetHdlBudgetForTests(): void {
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

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  missing: boolean
}

export type Exec = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number }
) => Promise<ExecResult>

/** uid/gid of `nobody`: who untrusted code runs as when the server is root. */
export const SANDBOX_ID = 65534

/** Run as nobody only when we can: root in the image; tests run as they are. */
export function sandboxIds(
  uid: number | undefined = process.getuid?.()
): { uid: number; gid: number } | null {
  return uid === 0 ? { uid: SANDBOX_ID, gid: SANDBOX_ID } : null
}

/** Hand the run's directory and files to nobody, so the tools can write there. */
export async function giveToSandbox(
  paths: string[],
  ids = sandboxIds()
): Promise<void> {
  if (!ids) return
  for (const p of paths) await chown(p, ids.uid, ids.gid)
}

/** The real runner: an empty environment, a deadline, bounded output. */
export const execTool: Exec = (cmd, args, opts) =>
  new Promise(resolve => {
    execFileCb(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs,
        maxBuffer: 512 * 1024,
        killSignal: 'SIGKILL',
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: opts.cwd },
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

export async function runHdl(
  args: Record<string, unknown>,
  ctx: ToolContext | undefined,
  deps: { exec?: Exec; now?: () => number } = {}
): Promise<Record<string, unknown>> {
  const who = String(ctx?.telegramId ?? '')
  if (!who) throw new Error('who is asking?')
  const mode = String(args.mode ?? 'lint') as HdlMode
  if (!HDL_MODES.includes(mode))
    return { ran: false, reason: `mode: ${HDL_MODES.join(' | ')}` }
  const checked = checkSources(args.files)
  if (!checked.ok) return { ran: false, reason: checked.reason }
  const top = args.top ? String(args.top) : null
  const steps = commandsFor(mode, checked.files, top, PREPROCESSED)
  if (!Array.isArray(steps)) return { ran: false, reason: steps.reason }
  if (!allowRun(who, (deps.now ?? Date.now)()))
    return {
      ran: false,
      reason: `${RUNS_PER_HOUR} runs an hour per person -- try later`,
    }
  const exec = deps.exec ?? execTool
  const dir = await mkdtemp(join(tmpdir(), 'hdl-'))
  try {
    for (const f of checked.files) await writeFile(join(dir, f.name), f.content)
    await giveToSandbox([dir, ...checked.files.map(f => join(dir, f.name))])
    const missing = (cmd: string) => ({
      ran: false,
      reason: `${cmd} is not installed in the service -- say "не запускалось", do not guess its output`,
    })
    /*
     * Macros first: the same preprocessor the simulator uses, so a system
     * task pasted together by a macro is seen here by name.
     */
    const pre = preprocessStep(checked.files)
    const expanded = await exec(pre.cmd, pre.args, {
      cwd: dir,
      timeoutMs: DEADLINE_MS.lint,
    })
    if (expanded.missing) return missing(pre.cmd)
    if (expanded.code !== 0 || expanded.timedOut)
      return {
        ran: true,
        mode,
        passed: false,
        steps: [
          {
            command: [pre.cmd, ...pre.args].join(' '),
            exit: expanded.code,
            ...(expanded.timedOut ? { timedOut: true } : {}),
            output: clip(`${expanded.stdout}\n${expanded.stderr}`.trim()),
          },
        ],
        note: "the preprocessor's own output: the sources did not get past `include/`define",
      }
    // No text is no pass: an unreadable expansion is refused, never waved on.
    const text = await readFile(join(dir, PREPROCESSED), 'utf8').catch(
      () => null
    )
    if (text === null)
      return {
        ran: false,
        reason: 'the preprocessed sources could not be read',
      }
    const hidden = text.match(FORBIDDEN)
    if (hidden)
      return {
        ran: false,
        reason: `${hidden[0]} appears once the macros are expanded -- not allowed here (no file, process or environment access)`,
      }
    const out: Array<Record<string, unknown>> = []
    for (const s of steps) {
      const r = await exec(s.cmd, s.args, {
        cwd: dir,
        timeoutMs: DEADLINE_MS[mode],
      })
      if (r.missing) return missing(s.cmd)
      const report = s.report
        ? await readFile(join(dir, s.report), 'utf8').catch(() => '')
        : ''
      out.push({
        command: [s.cmd, ...s.args].join(' '),
        exit: r.code,
        ...(r.timedOut ? { timedOut: true } : {}),
        output: clip(
          `${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}${report ? `\n${report}` : ''}`.trim()
        ),
      })
      if (r.code !== 0 || r.timedOut) break
    }
    const last = out[out.length - 1]
    return {
      ran: true,
      mode,
      passed: out.length === steps.length && last.exit === 0 && !last.timedOut,
      steps: out,
      note: "the tools' own output, as they printed it: quote it, do not round it",
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const HDL_TOOLS: AgentTool[] = [
  {
    name: 'hdl_run',
    description:
      'Run Verilog/SystemVerilog through the real open tools: mode lint (verilator ' +
      '--lint-only), sim (iverilog -g2012 + vvp: a testbench that $display-s and ' +
      '$finish-es), synth (yosys synth_xilinx -top <top>; stat -- resources). Files ' +
      'as {name, content}; no file I/O tasks, `include only of your own files. ' +
      "Returns the tools' own output and exit codes. Free, 30 runs an hour.",
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: [...HDL_MODES] },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['name', 'content'],
            additionalProperties: false,
          },
        },
        top: { type: 'string', description: 'top module (required for synth)' },
      },
      required: ['mode', 'files'],
      additionalProperties: false,
    },
    handler: (args, ctx) => runHdl(args, ctx as ToolContext),
  },
]
